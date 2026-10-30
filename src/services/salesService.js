import { supabase, fetchAllRows } from '../supabase';
import { voidTransaction as stockVoidTransaction } from './stockService';
import { sendOrderConfirmationWhatsapp, sendDispatchConfirmationWhatsapp } from './whatsappService';
import { getPackagingSize } from './purchaseService';
import { roundQty } from '../lib/qty';
import { getGroupNameFromItem } from './productGroupingService';
import { toWhatsappSafeName, stripGroupPrefix, formatWaNumber, numberLabel } from '../lib/whatsappFormat';

// Bag <-> Kg conversion for dispatch planning. `product.unit` is the
// master unit ('bag' or 'kg'); `product.mux` (e.g. "32 Kg") gives the
// kg-per-bag packaging size. Converting INTO the master unit is what
// drives stock deduction and pending-qty math, so it stays correct no
// matter which unit a given dispatch was actually recorded in.
export const convertQtyToMasterUnit = (qty, fromUnit, product) => {
  const amount = Number(qty) || 0;
  const masterUnit = (product?.unit || '').toLowerCase();
  const entryUnit = (fromUnit || masterUnit).toLowerCase();
  if (!masterUnit || entryUnit === masterUnit) return amount;
  const mux = getPackagingSize(product);
  if (masterUnit === 'bag' && entryUnit === 'kg') return mux > 0 ? amount / mux : amount;
  if (masterUnit === 'kg' && entryUnit === 'bag') return amount * mux;
  return amount;
};

export const convertQtyFromMasterUnit = (qty, toUnit, product) => {
  const amount = Number(qty) || 0;
  const masterUnit = (product?.unit || '').toLowerCase();
  const targetUnit = (toUnit || masterUnit).toLowerCase();
  if (!masterUnit || targetUnit === masterUnit) return amount;
  const mux = getPackagingSize(product);
  if (masterUnit === 'bag' && targetUnit === 'kg') return amount * mux;
  if (masterUnit === 'kg' && targetUnit === 'bag') return mux > 0 ? amount / mux : amount;
  return amount;
};

export const generateMultipleOrderNumbers = async (count) => {
  if (!count || count <= 0) return [];

  // Sort by created_at descending to find the highest existing numeric order number,
  // avoiding alphabetical string sort issues where 'VPR/OR-999' > 'VPR/OR-1043'.
  const { data, error } = await supabase
    .from('sales_orders')
    .select('order_number')
    .in('is_deleted', [true, false])
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  let maxNum = 0;
  if (data && data.length > 0) {
    for (const r of data) {
      const match = r.order_number?.match(/VPR\/OR-(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
  }

  // Generate non-conflicting consecutive order numbers
  let next = maxNum + 1;
  const numbers = [];
  while (numbers.length < count) {
    const candidate = `VPR/OR-${String(next).padStart(3, '0')}`;
    const { data: exists } = await supabase
      .from('sales_orders')
      .select('order_number')
      .in('is_deleted', [true, false])
      .eq('order_number', candidate)
      .limit(1);

    if (!exists || exists.length === 0) {
      numbers.push(candidate);
    }
    next++;
  }

  return numbers;
};

export const generateNextOrderNumber = async () => {
  const numbers = await generateMultipleOrderNumbers(1);
  return numbers[0] || 'VPR/OR-001';
};

export const getProductCurrentStockAndTransit = async (productIds) => {
  if (!productIds || productIds.length === 0) return { stockMap: {}, transitMap: {} };
  
  // Current Stock (from transactions) — the ledger can hold far more than
  // 1000 rows across these product ids, so this must page past Supabase's
  // per-request cap rather than fetch a single unbounded request.
  const txns = await fetchAllRows(() => supabase
    .from('transactions')
    .select('product_id, qty, txn_type')
    .eq('is_void', false)
    .in('product_id', productIds));

  const stockMap = {};
  for (const txn of txns || []) {
    if (!stockMap[txn.product_id]) stockMap[txn.product_id] = 0;
    if (['OPEN_STOCK', 'IN_FACTORY', 'PRODUCTION_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PURCHASE_IN', 'PURCHASE_IN(TPT)'].includes(txn.txn_type)) {
      stockMap[txn.product_id] += Number(txn.qty);
    } else {
      stockMap[txn.product_id] -= Number(txn.qty);
    }
  }

  // In Transit — lifts not yet Arrived/Received. purchase_deliveries has no
  // product_id/dispatch_qty/arrived_qty columns of its own; product comes
  // through purchase_indent_items, and the lift's qty is received_quantity.
  const transit = await fetchAllRows(() => supabase
    .from('purchase_deliveries')
    .select('received_quantity, status, delivery_date, expected_delivery_date, purchase_indent_items!inner(product_id)')
    .in('status', ['In Transit', 'In Transport Godown', 'AT TPT GDN'])
    .in('purchase_indent_items.product_id', productIds));

  const transitMap = {};
  const transitDateMap = {};
  for (const t of transit || []) {
    const pid = t.purchase_indent_items?.product_id;
    if (!pid) continue;
    transitMap[pid] = (transitMap[pid] || 0) + Number(t.received_quantity || 0);
    const dateVal = t.delivery_date || t.expected_delivery_date;
    if (dateVal) {
      if (!transitDateMap[pid] || dateVal > transitDateMap[pid]) {
        transitDateMap[pid] = dateVal;
      }
    }
  }

  return { stockMap, transitMap, transitDateMap };
};

export const getAllOrders = async () => {
  // One round-trip instead of three: dispatch_plans and their transactions
  // are pulled in the same nested select as the orders/items themselves
  // (PostgREST follows the FK relationships), instead of separately fetching
  // dispatch_plans for every item's id and then transactions for every
  // plan's id as two more sequential round-trips. Each round-trip costs a
  // full network RTT on top of query time, so collapsing 3 into 1 is a large
  // win regardless of data volume — this was the main cause of the Orders
  // tab's slow load.
  const orders = await fetchAllRows(() => supabase
    .from('sales_orders')
    .select(`*, process_type, customers:customer_id(name),
      sales_order_items(*, products:product_id(name, unit), godowns:godown_id(name),
        dispatch_plans(*, transactions(qty, is_void)))`)
    .order('created_at', { ascending: false }));
  if (!orders || orders.length === 0) return [];

  return orders.map(o => ({
    ...o,
    sales_order_items: (o.sales_order_items || []).map(i => ({
      ...i,
      dispatch_plans: (i.dispatch_plans || []).map(p => {
        const { transactions, ...plan } = p;
        const already_dispatched = (transactions || [])
          .filter(t => !t.is_void)
          .reduce((sum, t) => sum + Number(t.qty), 0);
        return { ...plan, already_dispatched };
      }),
    })),
  }));
};

export const createOrder = async ({ order_date, order_number, customer_id, items, created_by, process_type, notify_customer = true }) => {
  const total = items.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0);

  const { data: order, error: orderErr } = await supabase
    .from('sales_orders')
    .insert([{ order_date, order_number, customer_id, total_amount: total, created_by, process_type: process_type || 'order_process' }])
    .select()
    .single();
  if (orderErr) throw orderErr;

  if (items.length > 0) {
    const itemRows = items.map(item => ({
      order_id: order.order_id,
      product_id: item.product_id,
      godown_id: item.godown_id || null,
      unit_price: Number(item.unit_price),
      quantity: Number(item.quantity),
      // Selected_Unit/sales_qty are just a record of what was actually
      // picked/typed on Create Order's own Unit + Qty inputs — quantity
      // above is always the converted, product-master-unit figure that
      // drives the rest of the sales/dispatch pipeline.
      Selected_Unit: item.Selected_Unit || null,
      sales_qty: item.sales_qty != null ? Number(item.sales_qty) : null,
    }));
    const { error: itemErr } = await supabase
      .from('sales_order_items')
      .insert(itemRows);
    if (itemErr) throw itemErr;
  }

  if (notify_customer) {
    notifyOrderConfirmation(customer_id, items, order_date).catch(err => {
      console.error('WhatsApp order confirmation failed:', err.message);
    });
  }

  return order;
};

// "Direct" order — the Dispatch Planning page's Direct button. Same shape as
// createOrder (sales_orders + sales_order_items), except process_type is
// always 'direct' and every item's dispatch is auto-planned right away via
// saveDispatchPlan, instead of leaving the order sitting in Dispatch
// Planning's Pending list for someone to plan later — that's the whole point
// of "Direct": one popup takes it from order straight to a planned dispatch
// (dispatch_plans row), same as checking a row and clicking "Dispatch"
// there, just skipping the separate trip. Like every plan, it waits in
// Dispatch Completed, where the godown is picked and stock goes out.
// A per-item planning failure never rolls back the
// order/item itself — that item is simply left pending, exactly like any
// other order item, and can still be planned normally from Dispatch
// Planning later. Failures are returned (not thrown) so the caller can
// surface them without losing the order that was otherwise created fine.
export const createDirectOrder = async ({ order_date, order_number, customer_id, items, created_by, notify_customer = true }) => {
  const total = items.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0);

  const { data: order, error: orderErr } = await supabase
    .from('sales_orders')
    .insert([{ order_date, order_number, customer_id, total_amount: total, created_by, process_type: 'direct' }])
    .select()
    .single();
  if (orderErr) throw orderErr;

  let createdItems = [];
  if (items.length > 0) {
    const itemRows = items.map(item => ({
      order_id: order.order_id,
      product_id: item.product_id,
      godown_id: item.godown_id || null,
      unit_price: Number(item.unit_price),
      quantity: Number(item.quantity),
      Selected_Unit: item.Selected_Unit || null,
      sales_qty: item.sales_qty != null ? Number(item.sales_qty) : null,
    }));
    // .select() here (unlike createOrder) so each row comes back with its
    // real item_id — saveDispatchPlan needs it right below.
    const { data: insertedItems, error: itemErr } = await supabase
      .from('sales_order_items')
      .insert(itemRows)
      .select();
    if (itemErr) throw itemErr;
    createdItems = insertedItems || [];
  }

  const planErrors = [];
  for (const item of createdItems) {
    try {
      await saveDispatchPlan({
        order_item_id: item.item_id,
        quantity: item.quantity,
        unit: item.Selected_Unit,
        converted_qty: item.sales_qty,
        godown_id: item.godown_id || null,
        unit_price: item.unit_price,
        dispatch_date: order_date,
        created_by,
      });
    } catch (err) {
      planErrors.push({ item_id: item.item_id, product_id: item.product_id, message: err.message });
    }
  }

  // Only confirm the items that actually got planned. If every item
  // failed, no WhatsApp message goes out at all.
  const failedItemIds = new Set(planErrors.map(e => e.item_id));
  const dispatchedItems = createdItems.filter(item => !failedItemIds.has(item.item_id));

  if (notify_customer && dispatchedItems.length > 0) {
    notifyOrderConfirmation(customer_id, dispatchedItems, order_date).catch(err => {
      console.error('WhatsApp order confirmation failed:', err.message);
    });
  }

  return { order, items: createdItems, planErrors };
};

const formatOrderReceivedDate = (dateStr) => {
  if (!dateStr) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  try {
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
      return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return String(dateStr);
  }
};

const formatSize = (s) => (s || '').replace(/\s*[\*×x]\s*/gi, ' × ').trim();

const formatUnitPlural = (unit, qty) => {
  const u = (unit || '').trim().toLowerCase();
  if (u === 'bag' || u === 'bags') return Number(qty) === 1 ? 'bag' : 'bags';
  return unit || '';
};

const buildOrderItemEntry = (item, p, index) => {
  const brandAndCat = [p?.brand_name, p?.category].map(v => (v || '').trim()).filter(Boolean).join(' ');
  let size = formatSize(p?.product_type);
  let title = brandAndCat;

  if (!title) {
    let name = toWhatsappSafeName(p?.name || 'Item');
    const sizeMatch = name.match(/(\d+(\.\d+)?\s*[×\*x]\s*\d+(\.\d+)?)/i);
    if (!size && sizeMatch) {
      size = formatSize(sizeMatch[1]);
      name = name.replace(sizeMatch[0], '').replace(/\(\s*\d+\s*kg\s*\)/gi, '').trim();
    }
    title = name;
  }

  const price = item.unit_price != null && Number(item.unit_price) > 0
    ? ` — ₹${formatWaNumber(item.unit_price)}/-`
    : '';

  const qty = item.sales_qty != null ? Number(item.sales_qty) : Number(item.quantity);
  const unitLabel = formatUnitPlural(item.Selected_Unit || p?.unit || '', qty);
  const sizePart = size ? `   ${size}` : '';

  return `${numberLabel(index)} ${title}${price}${sizePart} — ${formatWaNumber(qty)}${unitLabel ? ' ' + unitLabel : ''}`;
};

const notifyOrderConfirmation = async (customer_id, items, order_date) => {
  const { data: customer } = await supabase
    .from('customers')
    .select('name, phone_number')
    .eq('customer_id', customer_id)
    .single();
  if (!customer?.phone_number) return;

  const productIds = [...new Set(items.map(i => i.product_id))];
  const { data: productRows } = await supabase
    .from('products')
    .select('product_id, name, unit, brand_name, category, product_type, mux')
    .in('product_id', productIds);
  const prodMap = {};
  (productRows || []).forEach(p => { prodMap[p.product_id] = p; });

  const itemDetails = items
    .map((item, index) => buildOrderItemEntry(item, prodMap[item.product_id], index))
    .join(' • ');

  const totalQtyNum = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const distinctUnits = [...new Set(items.map(i => (i.Selected_Unit || prodMap[i.product_id]?.unit || '').trim()).filter(Boolean))];
  const totalUnitLabel = distinctUnits.length === 1 ? formatUnitPlural(distinctUnits[0], totalQtyNum) : '';
  const totalQty = totalUnitLabel ? `${formatWaNumber(totalQtyNum)} ${totalUnitLabel}` : String(formatWaNumber(totalQtyNum));
  const formattedOrderDate = formatOrderReceivedDate(order_date);

  await sendOrderConfirmationWhatsapp({
    phone: customer.phone_number,
    customerName: customer.name,
    itemDetails,
    totalQty,
    orderDate: formattedOrderDate,
  });
};

export const updateOrder = async (order_id, { order_date, order_number, customer_id, items, process_type, notify_customer = false }) => {
  const total = items.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0);

  const updateFields = { order_date, order_number, customer_id, total_amount: total };
  if (process_type) updateFields.process_type = process_type;
  const { error: orderErr } = await supabase
    .from('sales_orders')
    .update(updateFields)
    .eq('order_id', order_id);
  if (orderErr) throw orderErr;

  const { data: existingIds, error: fetchErr } = await supabase
    .from('sales_order_items')
    .select('item_id')
    .eq('order_id', order_id);
  if (fetchErr) throw fetchErr;

  const allItemIds = (existingIds || []).map(i => i.item_id);
  const { data: plans } = await supabase
    .from('dispatch_plans')
    .select('order_item_id')
    .in('order_item_id', allItemIds.length > 0 ? allItemIds : [null]);
  const planItemIds = new Set((plans || []).map(p => p.order_item_id));

  const incomingIds = new Set(items.filter(i => i.item_id).map(i => i.item_id));

  for (const item of items) {
    if (item.item_id && incomingIds.has(item.item_id)) {
      if (planItemIds.has(item.item_id)) continue;
      const { error: updErr } = await supabase
        .from('sales_order_items')
        .update({
          product_id: item.product_id,
          godown_id: item.godown_id || null,
          unit_price: Number(item.unit_price),
          quantity: Number(item.quantity),
          Selected_Unit: item.Selected_Unit || null,
          sales_qty: item.sales_qty != null ? Number(item.sales_qty) : null,
        })
        .eq('item_id', item.item_id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase
        .from('sales_order_items')
        .insert({
          order_id,
          product_id: item.product_id,
          godown_id: item.godown_id || null,
          unit_price: Number(item.unit_price),
          quantity: Number(item.quantity),
          Selected_Unit: item.Selected_Unit || null,
          sales_qty: item.sales_qty != null ? Number(item.sales_qty) : null,
        });
      if (insErr) throw insErr;
    }
  }

  for (const existing of existingIds || []) {
    if (incomingIds.has(existing.item_id)) continue;
    if (planItemIds.has(existing.item_id)) continue;
    const { error: delErr } = await supabase
      .from('sales_order_items')
      .delete()
      .eq('item_id', existing.item_id);
    if (delErr) throw delErr;
  }

  if (notify_customer) {
    notifyOrderConfirmation(customer_id, items, order_date).catch(err => {
      console.error('WhatsApp order confirmation failed:', err.message);
    });
  }
};

// PostgREST (Supabase's REST layer) can reject a GET with a "400 Bad Request"
// once its URL gets too long — an .in() filter built from every id in a
// large/growing table (e.g. every sales order item ever created, or every
// dispatch plan tied to them) can cross that line silently as the business
// scales, with no useful error surfaced to the page. Batch such lookups into
// bounded chunks and merge the results so the id list handed to any single
// request always stays well under that limit.
const IN_CHUNK_SIZE = 150;
const fetchInChunks = async (ids, chunkFn) => {
  const results = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const { data, error } = await chunkFn(ids.slice(i, i + IN_CHUNK_SIZE));
    if (error) throw error;
    if (data) results.push(...data);
  }
  return results;
};

export const getAllOrderItemsForDispatch = async () => {
  const items = await fetchAllRows(() => supabase
    .from('sales_order_items')
    .select(`
      *,
      sales_orders!inner(
        order_number, order_date, process_type,
        customers:customer_id(name)
      ),
      products:product_id(name, unit, mux),
      godowns:godown_id(name)
    `)
    .order('created_at', { ascending: false }));
  if (!items || items.length === 0) return [];

  const ids = items.map(i => i.item_id);
  const plans = await fetchInChunks(ids, (chunk) =>
    supabase.from('dispatch_plans').select('*').in('order_item_id', chunk)
  );

  const planIds = plans.map(p => p.plan_id).filter(Boolean);
  const dispatchedMap = {};
  if (planIds.length > 0) {
    const txns = await fetchInChunks(planIds, (chunk) =>
      supabase.from('transactions').select('dispatch_plan_id, qty').in('dispatch_plan_id', chunk).eq('is_void', false)
    );
    txns.forEach(t => {
      dispatchedMap[t.dispatch_plan_id] = (dispatchedMap[t.dispatch_plan_id] || 0) + Number(t.qty);
    });
  }

  const planMap = {};
  plans.forEach(p => {
    if (!planMap[p.order_item_id]) planMap[p.order_item_id] = [];
    planMap[p.order_item_id].push({ ...p, already_dispatched: dispatchedMap[p.plan_id] || 0 });
  });

  return items
    .map(item => ({
      ...item,
      dispatch_plans: planMap[item.item_id] || [],
    }));
};

export const getSkipDeliveredItems = async () => {
  const items = await fetchAllRows(() => supabase
    .from('sales_order_items')
    .select(`
      *,
      sales_orders!inner(
        order_number, order_date, process_type, created_by, customer_id,
        customers:customer_id(name)
      ),
      products:product_id(name, unit)
    `)
    .eq('sales_orders.process_type', 'skip_delivered')
    .order('created_at', { ascending: false }));
  if (!items || items.length === 0) return [];

  const ids = items.map(i => i.item_id);
  const plans = await fetchInChunks(ids, (chunk) =>
    supabase.from('dispatch_plans').select('*, users:created_by(full_name)').in('order_item_id', chunk)
  );

  const planIds = plans.map(p => p.plan_id).filter(Boolean);
  const dispatchedMap = {};
  if (planIds.length > 0) {
    const txns = await fetchInChunks(planIds, (chunk) =>
      supabase.from('transactions').select('dispatch_plan_id, qty').in('dispatch_plan_id', chunk).eq('is_void', false)
    );
    txns.forEach(t => {
      dispatchedMap[t.dispatch_plan_id] = (dispatchedMap[t.dispatch_plan_id] || 0) + Number(t.qty);
    });
  }

  const planMap = {};
  plans.forEach(p => {
    if (!planMap[p.order_item_id]) planMap[p.order_item_id] = [];
    planMap[p.order_item_id].push({ ...p, already_dispatched: dispatchedMap[p.plan_id] || 0 });
  });

  const userIds = new Set(items.filter(i => i.sales_orders?.created_by).map(i => i.sales_orders.created_by));
  const { data: users } = userIds.size > 0
    ? await supabase.from('users').select('user_id, full_name').in('user_id', [...userIds])
    : { data: [] };
  const userMap = {};
  (users || []).forEach(u => { userMap[u.user_id] = u.full_name; });

  return items
    .map(item => ({
      ...item,
      dispatch_plans: planMap[item.item_id] || [],
      person_name: userMap[item.sales_orders?.created_by] || '—',
    }))
    .filter(item => {
      const allPlans = item.dispatch_plans || [];
      const totalClaimed = allPlans
        .filter(p => p.dispatch_status !== 'Cancelled')
        .reduce((sum, p) => sum + Number(p.already_dispatched || 0), 0);
      const cancelled = Number(item.cancelled_quantity || 0);
      return Number(item.quantity) - totalClaimed - cancelled > 0;
    });
};

export const getAllDispatchPlans = async () => {
  const data = await fetchAllRows(() => supabase
    .from('dispatch_plans')
    .select(`
      *,
      sales_order_items!inner(
        item_id,
        product_id,
        quantity,
        godown_id,
        products:product_id(name, unit, mux),
        godowns:godown_id(name),
        sales_orders!inner(
          order_number, order_date, process_type,
          customers:customer_id(name)
        )
      ),
      godowns:godown_id(name),
      users:created_by(full_name)
    `)
    .order('created_at', { ascending: false }));

  const plansData = data || [];
  const planIds = plansData.map(p => p.plan_id).filter(Boolean);
  if (planIds.length > 0) {
    // dispatch_plan_id .in() list is chunked to stay under the URL-length
    // limit (see fetchInChunks above), and each chunk's own result is paged
    // past the 1000-row cap via fetchAllRows — a plan can accumulate many
    // transactions once edits/corrections pile up.
    const txns = await fetchInChunks(planIds, (chunk) =>
      fetchAllRows(() => supabase
        .from('transactions')
        .select('dispatch_plan_id, qty')
        .in('dispatch_plan_id', chunk)
        .eq('is_void', false)
      ).then(rows => ({ data: rows, error: null }))
    );
    const dispatchedMap = {};
    (txns || []).forEach(t => {
      dispatchedMap[t.dispatch_plan_id] = (dispatchedMap[t.dispatch_plan_id] || 0) + Number(t.qty);
    });
    return plansData.map(plan => ({
      ...plan,
      already_dispatched: dispatchedMap[plan.plan_id] || 0,
    }));
  }
  return plansData.map(plan => ({ ...plan, already_dispatched: 0 }));
};

// Every live (non-void) dispatch that has actually gone out, in the
// product's master unit — Sales dispatch plans (dispatch_plan_id set) and
// Stock Management's manual Dispatch Out entries (no plan), which all post
// as OUT_GODOWN. txn_date is never in the future for either.
// A plan not yet completed (Pending/Planned) can still carry the OUT_GODOWN
// entry older plans made at planning time — that's a reservation, not a
// dispatch, so it's left out (it would otherwise inflate Total Dispatched /
// AVG Daily Consumption in Ultimate IMS).
export const getDispatchTransactions = async () => {
  const txns = await fetchAllRows(() => supabase
    .from('transactions')
    .select('txn_id, product_id, godown_id, qty, txn_date, dispatch_plan_id')
    .eq('txn_type', 'OUT_GODOWN')
    .eq('is_void', false)
    .order('txn_id', { ascending: true }));

  const planIds = [...new Set(txns.map(t => t.dispatch_plan_id).filter(Boolean))];
  if (planIds.length === 0) return txns;
  const plans = await fetchInChunks(planIds, (chunk) =>
    supabase.from('dispatch_plans').select('plan_id, dispatch_status').in('plan_id', chunk)
  );
  const completed = new Set(
    plans.filter(p => p.dispatch_status === 'Dispatch Done' || p.dispatch_status === 'Partially Dispatched').map(p => p.plan_id)
  );
  return txns.filter(t => !t.dispatch_plan_id || completed.has(t.dispatch_plan_id));
};

// Reserves `count` dispatch numbers by finding the highest existing numeric DN
// across all records (including soft-deleted ones) and verifying non-collision.
export const generateNextDispatchNumbers = async (count) => {
  if (!count || count <= 0) return [];

  // Query dispatch_plans including soft-deleted rows so deleted DN numbers are never reused.
  const { data, error } = await supabase
    .from('dispatch_plans')
    .select('dispatch_number')
    .in('is_deleted', [true, false])
    .like('dispatch_number', 'DN-%')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  let maxNum = 0;
  if (data && data.length > 0) {
    for (const r of data) {
      const match = r.dispatch_number?.match(/DN-(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
  }

  // Also query descending by dispatch_number to catch any out-of-order creations
  const { data: dnData } = await supabase
    .from('dispatch_plans')
    .select('dispatch_number')
    .in('is_deleted', [true, false])
    .like('dispatch_number', 'DN-%')
    .order('dispatch_number', { ascending: false })
    .limit(20);

  if (dnData && dnData.length > 0) {
    for (const r of dnData) {
      const match = r.dispatch_number?.match(/DN-(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
  }

  const numbers = [];
  let next = maxNum + 1;
  while (numbers.length < count) {
    const candidate = `DN-${String(next).padStart(4, '0')}`;
    const { data: exists } = await supabase
      .from('dispatch_plans')
      .select('dispatch_number')
      .in('is_deleted', [true, false])
      .eq('dispatch_number', candidate)
      .limit(1);

    if (!exists || exists.length === 0) {
      numbers.push(candidate);
    }
    next++;
  }

  return numbers;
};

export const generateNextDispatchNumber = async () => {
  const numbers = await generateNextDispatchNumbers(1);
  return numbers[0] || 'DN-0001';
};

const PG_UNIQUE_VIOLATION = '23505';

// `stock_out` — false (default) only books the plan: no stock check and no
// stock-ledger entry; godown stock is checked and deducted later, when the
// plan is completed (completeDispatchWithStockOut), which is also where the
// godown is chosen — so godown_id may be null here. true checks stock and
// posts the OUT_GODOWN transaction right away (needs a godown_id).
export const saveDispatchPlan = async ({ plan_id, order_item_id, quantity, unit, converted_qty, godown_id, unit_price, dispatch_date, created_by, dispatch_status, stock_out = false }) => {
  // `quantity` is already the master-unit dispatch amount (the caller
  // converts it before calling this) — it keeps its original,
  // pre-conversion-feature meaning and is what drives stock deduction and
  // pending-qty math, same as every other row. Quantities may carry up to
  // two decimal places (see src/lib/qty.js), so this rounds to that
  // precision rather than to a whole number. `converted_qty`, if passed, is purely a
  // record of what was actually typed on screen, in whichever unit `unit`
  // names — it never feeds stock math. Callers that only pass `quantity`
  // (older flows that never leave the master unit) get converted_value
  // mirroring quantity, unchanged from before this feature.
  const stockQty = roundQty(quantity);
  const payload = {
    order_item_id,
    quantity: stockQty,
    // dispatch_plans' actual columns are named convert_unit / converted_value
    // (added via the Supabase table editor), not unit / converted_qty.
    convert_unit: unit || null,
    converted_value: (converted_qty !== undefined && converted_qty !== null && converted_qty !== '') ? Number(converted_qty) : stockQty,
    godown_id,
    unit_price: Number(unit_price),
    dispatch_date,
    is_planned: true,
    updated_at: new Date().toISOString(),
    dispatch_status: dispatch_status || 'Pending',
    created_by,
  };

  const { data: item } = await supabase.from('sales_order_items').select('product_id').eq('item_id', order_item_id).single();
  if (!item) throw new Error('Order item not found.');
  const product_id = item.product_id;

  const { data: product } = await supabase.from('products').select('allow_negative_stock').eq('product_id', product_id).single();

  const getTodayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const back_dated = new Date(dispatch_date) < new Date(getTodayLocal());
  // When stock goes out here (stock_out), the stock-ledger transaction
  // always posts on (at latest) today. A future dispatch_date is kept as-is
  // on the plan itself (drives the "Dispatch Date" column/planning), but the
  // linked transaction's txn_date is capped at today so the deduction shows
  // up immediately in Stock Management / Live Stock Dashboard instead of
  // sitting invisible on a future date nobody's looking at yet. A
  // back-dated dispatch_date (in the past) still posts on that same past
  // date, unchanged from before.
  const txnDate = dispatch_date > getTodayLocal() ? getTodayLocal() : dispatch_date;

  if (plan_id) {
    const { data: existing } = await supabase.from('dispatch_plans').select('dispatch_number, quantity, godown_id, dispatch_status').eq('plan_id', plan_id).single();
    payload.dispatch_number = existing?.dispatch_number;
    if (existing) payload.created_by = created_by;

    // Editing a plan that hasn't been completed yet: just update the plan.
    // Plans made before stock moved to the completion step still carry
    // their planning-time OUT_GODOWN entry — remove it so the stock comes
    // back now and is checked/deducted again on completion.
    if (!stock_out && existing?.dispatch_status !== 'Dispatch Done') {
      const { data, error } = await supabase
        .from('dispatch_plans')
        .update(payload)
        .eq('plan_id', plan_id)
        .select()
        .single();
      if (error) throw error;
      const { error: txnErr } = await supabase.from('transactions').delete().eq('dispatch_plan_id', plan_id).eq('is_void', false);
      if (txnErr) throw txnErr;
      return data;
    }

    const { data: stockRow } = await supabase.from('godown_stock').select('current_stock').eq('product_id', product_id).eq('godown_id', godown_id).maybeSingle();
    const available = stockRow?.current_stock ?? 0;

    const { data: existingTxn } = await supabase.from('transactions').select('txn_id, qty, godown_id').eq('dispatch_plan_id', plan_id).eq('is_void', false).maybeSingle();

    let diff = stockQty;
    if (existingTxn && existingTxn.godown_id === godown_id) {
       diff = stockQty - existingTxn.qty;
    }

    if (diff > 0 && available < diff && !product?.allow_negative_stock) {
      throw new Error(`Insufficient stock. Available: ${available}, Required diff: ${diff}.`);
    }

    const { data, error } = await supabase
      .from('dispatch_plans')
      .update(payload)
      .eq('plan_id', plan_id)
      .select()
      .single();
    if (error) throw error;

    if (existingTxn) {
      await supabase.from('transactions').update({
        qty: stockQty,
        godown_id: payload.godown_id,
        txn_date: txnDate,
        back_dated
      }).eq('txn_id', existingTxn.txn_id);
    } else {
       await supabase.from('transactions').insert([{
         product_id,
         godown_id,
         txn_date: txnDate,
         txn_type: 'OUT_GODOWN',
         qty: stockQty,
         is_void: false,
         created_by,
         back_dated,
         dispatch_plan_id: plan_id,
         dispatch_number: payload.dispatch_number,
       }]);
    }

    return data;
  }

  if (stock_out) {
    const { data: stockRow } = await supabase.from('godown_stock').select('current_stock').eq('product_id', product_id).eq('godown_id', godown_id).maybeSingle();
    const available = stockRow?.current_stock ?? 0;
    if (available < stockQty && !product?.allow_negative_stock) {
      throw new Error(`Insufficient stock. Available: ${available}, Required: ${stockQty}.`);
    }
  }

  payload.dispatch_number = await generateNextDispatchNumber();
  let planData = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('dispatch_plans')
      .insert([payload])
      .select()
      .single();

    if (!error) {
       planData = data;
       break;
    }

    if (error.code === PG_UNIQUE_VIOLATION) {
      payload.dispatch_number = await generateNextDispatchNumber();
      continue;
    }
    throw error;
  }

  if (!planData) {
    throw new Error('Failed to save dispatch plan after multiple attempts');
  }

  if (!stock_out) return planData;

  await supabase.from('transactions').insert([{
    product_id,
    godown_id,
    txn_date: txnDate,
    txn_type: 'OUT_GODOWN',
    qty: stockQty,
    is_void: false,
    created_by,
    back_dated,
    dispatch_plan_id: planData.plan_id,
    dispatch_number: payload.dispatch_number,
  }]);

  return planData;
};

// Cancels part (or all) of an order item's still-pending, never-planned
// quantity straight from Dispatch Planning's Pending tab. Unlike
// cancelOrderItems (which unwinds an already-created dispatch plan's stock
// transaction), there's no stock or transaction to unwind here — the qty was
// never dispatched — so this only bumps sales_order_items.cancelled_quantity
// and records a dispatch_plans row for the History tab, flagged
// is_planned: false so it's recognizable as this lightweight cancellation
// (vs. a real plan that got voided) and stays out of Dispatch Complete
// (whose Pending/Dispatch Done tabs only match those two statuses). No
// transactions row is inserted, so no sales value ever posts to the ledger.
//
// `dispatch_number` and `current_cancelled_quantity` are optional — a caller
// cancelling several rows at once (e.g. Dispatch Planning's bulk Cancel
// Order) can reserve numbers in one batch via generateNextDispatchNumbers()
// and pass each item's already-loaded cancelled_quantity, so every row's
// cancellation runs as exactly 2 round trips (insert + update) instead of 4,
// and the whole batch can run in parallel. Omit either and this falls back
// to fetching them itself, for standalone/single-row use.
export const cancelPendingQty = async ({ order_item_id, cancel_qty, godown_id, unit_price, created_by, dispatch_number, current_cancelled_quantity, reason }) => {
  const qty = roundQty(cancel_qty);
  if (!qty || qty <= 0) throw new Error('Enter a valid cancel quantity.');

  let baseCancelled = current_cancelled_quantity;
  if (baseCancelled === undefined) {
    const { data: itemRow } = await supabase
      .from('sales_order_items')
      .select('cancelled_quantity')
      .eq('item_id', order_item_id)
      .single();
    if (!itemRow) throw new Error('Order item not found.');
    baseCancelled = itemRow.cancelled_quantity;
  }

  const payload = {
    order_item_id,
    quantity: qty,
    godown_id: godown_id || null,
    unit_price: Number(unit_price) || 0,
    is_planned: false,
    dispatch_date: new Date().toISOString().split('T')[0],
    dispatch_status: 'Cancelled',
    created_by,
    cancelled_at: new Date().toISOString(),
    cancelled_by: created_by,
    cancelled_reason: reason || 'Cancelled from Dispatch Planning (pending quantity)',
    converted_value: qty,
  };

  payload.dispatch_number = dispatch_number || await generateNextDispatchNumber();
  let planData = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.from('dispatch_plans').insert([payload]).select().single();
    if (!error) { planData = data; break; }
    if (error.code === PG_UNIQUE_VIOLATION) { payload.dispatch_number = await generateNextDispatchNumber(); continue; }
    throw error;
  }
  if (!planData) throw new Error('Failed to record cancellation after multiple attempts.');

  const newCancelled = Number(baseCancelled || 0) + qty;
  const { error: updErr } = await supabase
    .from('sales_order_items')
    .update({ cancelled_quantity: newCancelled })
    .eq('item_id', order_item_id);
  if (updErr) throw updErr;

  return planData;
};

export const batchUpdateInformBeforeDispatch = async (planIds, inform_before_dispatch) => {
  if (!planIds || planIds.length === 0) return [];
  const { data, error } = await supabase
    .from('dispatch_plans')
    .update({ inform_before_dispatch, updated_at: new Date().toISOString() })
    .in('plan_id', planIds)
    .select();
  if (error) throw error;
  return data;
};

// `qtyByPlan` ({ [plan_id]: qty }, optional) — the qty that actually went
// out in this dispatch, used in the WhatsApp message instead of the plan's
// full qty (a partial dispatch only reports what was sent this time).
export const batchUpdateInformAfterDispatch = async (planIds, inform_after_dispatch, qtyByPlan = {}) => {
  if (!planIds || planIds.length === 0) return { plans: [], notifyResults: [] };
  const { data, error } = await supabase
    .from('dispatch_plans')
    .update({ inform_after_dispatch, updated_at: new Date().toISOString() })
    .in('plan_id', planIds)
    .select();
  if (error) throw error;

  // Real WhatsApp sends — awaited (not fire-and-forget) so callers can see
  // and surface which notifications actually went out, instead of the
  // "Informed" flag silently disagreeing with what the customer actually
  // received. One result per plan.
  let notifyResults = [];
  if (inform_after_dispatch === 'Informed') {
    notifyResults = await notifyDispatchConfirmations(planIds, qtyByPlan);
  }

  return { plans: data, notifyResults };
};

export const updateDispatchPlan = async (plan_id, { dispatch_date, godown_id, quantity, dispatch_status }) => {
  const updateData = {
    dispatch_date,
    godown_id,
    quantity: Number(quantity),
    updated_at: new Date().toISOString(),
  };
  if (dispatch_status) updateData.dispatch_status = dispatch_status;
  const { error } = await supabase
    .from('dispatch_plans')
    .update(updateData)
    .eq('plan_id', plan_id);
  if (error) throw error;
};

export const updateOrderItemFields = async (item_id, fields) => {
  const { error } = await supabase
    .from('sales_order_items')
    .update(fields)
    .eq('item_id', item_id);
  if (error) throw error;
};

export const updateOrderCustomer = async (order_id, customer_id) => {
  const { error } = await supabase
    .from('sales_orders')
    .update({ customer_id })
    .eq('order_id', order_id);
  if (error) throw error;
};

export const voidOrder = async (order_id) => {
  const { error } = await supabase
    .from('sales_orders')
    .update({ is_void: true })
    .eq('order_id', order_id);
  if (error) throw error;
};

// Dev-only hard delete: wipes an order and everything derived from it
// (dispatch plans, stock transactions, order items) so test data can be cleaned up.
export const deleteOrder = async (order_id) => {
  const { data: items, error: itemsErr } = await supabase
    .from('sales_order_items')
    .select('item_id')
    .eq('order_id', order_id);
  if (itemsErr) throw itemsErr;

  const itemIds = (items || []).map(i => i.item_id);

  if (itemIds.length > 0) {
    const { data: plans, error: plansErr } = await supabase
      .from('dispatch_plans')
      .select('plan_id')
      .in('order_item_id', itemIds);
    if (plansErr) throw plansErr;

    const planIds = (plans || []).map(p => p.plan_id);

    if (planIds.length > 0) {
      const { error: txnErr } = await supabase
        .from('transactions')
        .delete()
        .in('dispatch_plan_id', planIds);
      if (txnErr) throw txnErr;

      const { error: planDelErr } = await supabase
        .from('dispatch_plans')
        .delete()
        .in('plan_id', planIds);
      if (planDelErr) throw planDelErr;
    }

    const { error: itemDelErr } = await supabase
      .from('sales_order_items')
      .delete()
      .in('item_id', itemIds);
    if (itemDelErr) throw itemDelErr;
  }

  const { error: orderDelErr } = await supabase
    .from('sales_orders')
    .delete()
    .eq('order_id', order_id);
  if (orderDelErr) throw orderDelErr;
};

// Bulk version of deleteOrder above — the Orders tab's multi-select "Delete
// Selected". Same full cascade (transactions -> dispatch_plans ->
// sales_order_items -> sales_orders), just batched via fetchInChunks so
// selecting many whole orders at once doesn't send one round trip per order.
// Unlike deleteOrderItemsBulk (which only removes an order once every one of
// its items is gone), this always deletes every selected order outright,
// including whichever of its items it still has.
export const deleteOrdersBulk = async (orderIds) => {
  const ids = [...new Set(orderIds)].filter(Boolean);
  if (ids.length === 0) return { deletedOrderCount: 0 };

  const items = await fetchInChunks(ids, (chunk) =>
    supabase.from('sales_order_items').select('item_id').in('order_id', chunk)
  );
  const itemIds = items.map(i => i.item_id).filter(Boolean);

  if (itemIds.length > 0) {
    const plans = await fetchInChunks(itemIds, (chunk) =>
      supabase.from('dispatch_plans').select('plan_id').in('order_item_id', chunk)
    );
    const planIds = plans.map(p => p.plan_id).filter(Boolean);

    if (planIds.length > 0) {
      await fetchInChunks(planIds, (chunk) => supabase.from('transactions').delete().in('dispatch_plan_id', chunk));
      await fetchInChunks(planIds, (chunk) => supabase.from('dispatch_plans').delete().in('plan_id', chunk));
    }

    await fetchInChunks(itemIds, (chunk) => supabase.from('sales_order_items').delete().in('item_id', chunk));
  }

  await fetchInChunks(ids, (chunk) => supabase.from('sales_orders').delete().in('order_id', chunk));

  return { deletedOrderCount: ids.length };
};

// Deletes specific order-item rows (Dispatch Planning's "Delete Selected") —
// and everything derived from just those items (their dispatch plans, stock
// transactions) — rather than a whole order, so removing a few selected rows
// never touches sibling items on the same order that weren't selected. Once
// an order has no items left, its sales_orders row is removed too, mirroring
// deleteOrder's full cleanup but scoped down to the rows actually picked.
export const deleteOrderItemsBulk = async (itemIds) => {
  const ids = [...new Set(itemIds)].filter(Boolean);
  if (ids.length === 0) return { deletedItemCount: 0, deletedOrderCount: 0 };

  const items = await fetchInChunks(ids, (chunk) =>
    supabase.from('sales_order_items').select('item_id, order_id').in('item_id', chunk)
  );
  const orderIds = [...new Set(items.map(i => i.order_id).filter(Boolean))];

  const plans = await fetchInChunks(ids, (chunk) =>
    supabase.from('dispatch_plans').select('plan_id').in('order_item_id', chunk)
  );
  const planIds = plans.map(p => p.plan_id).filter(Boolean);

  if (planIds.length > 0) {
    await fetchInChunks(planIds, (chunk) => supabase.from('transactions').delete().in('dispatch_plan_id', chunk));
    await fetchInChunks(planIds, (chunk) => supabase.from('dispatch_plans').delete().in('plan_id', chunk));
  }

  await fetchInChunks(ids, (chunk) => supabase.from('sales_order_items').delete().in('item_id', chunk));

  // Clean up any parent order left with zero items after this deletion.
  let deletedOrderCount = 0;
  if (orderIds.length > 0) {
    const remaining = await fetchInChunks(orderIds, (chunk) =>
      supabase.from('sales_order_items').select('order_id').in('order_id', chunk)
    );
    const ordersWithItemsLeft = new Set(remaining.map(r => r.order_id));
    const emptyOrderIds = orderIds.filter(id => !ordersWithItemsLeft.has(id));
    if (emptyOrderIds.length > 0) {
      await fetchInChunks(emptyOrderIds, (chunk) => supabase.from('sales_orders').delete().in('order_id', chunk));
      deletedOrderCount = emptyOrderIds.length;
    }
  }

  return { deletedItemCount: ids.length, deletedOrderCount };
};

// Permanently removes selected dispatch_plans rows and their stock
// transactions — Dispatch Completed's "Delete Selected", for undoing a
// wrongly created/planned dispatch. Unlike deleteOrderItemsBulk this never
// touches sales_order_items/sales_orders, so the order item itself is
// untouched and simply becomes pending/re-plannable again once its plan
// (and the stock that plan took out) is gone.
//
// A Partially Dispatched plan isn't removed: what already went out stays a
// real dispatch (its stock entries are kept) — the plan is closed at that
// qty as Dispatch Done, and only the undispatched rest is dropped, which
// sends it back to Dispatch Planning's Pending list like any deleted plan.
export const deleteDispatchPlansBulk = async (planIds) => {
  const ids = [...new Set(planIds)].filter(Boolean);
  if (ids.length === 0) return { deletedCount: 0, closedCount: 0 };

  const plans = await fetchInChunks(ids, (chunk) =>
    supabase.from('dispatch_plans').select('plan_id, dispatch_status').in('plan_id', chunk)
  );
  const partialIds = plans.filter(p => p.dispatch_status === 'Partially Dispatched').map(p => p.plan_id);
  const partialSet = new Set(partialIds);
  const deleteIds = ids.filter(id => !partialSet.has(id));

  if (partialIds.length > 0) {
    const txns = await fetchInChunks(partialIds, (chunk) =>
      supabase.from('transactions').select('dispatch_plan_id, qty').in('dispatch_plan_id', chunk).eq('is_void', false)
    );
    const dispatchedMap = {};
    txns.forEach(t => { dispatchedMap[t.dispatch_plan_id] = (dispatchedMap[t.dispatch_plan_id] || 0) + Number(t.qty); });
    for (const plan_id of partialIds) {
      const { error } = await supabase
        .from('dispatch_plans')
        .update({
          quantity: roundQty(dispatchedMap[plan_id] || 0),
          dispatch_status: 'Dispatch Done',
          updated_at: new Date().toISOString(),
        })
        .eq('plan_id', plan_id);
      if (error) throw error;
    }
  }

  if (deleteIds.length > 0) {
    await fetchInChunks(deleteIds, (chunk) => supabase.from('transactions').delete().in('dispatch_plan_id', chunk));
    await fetchInChunks(deleteIds, (chunk) => supabase.from('dispatch_plans').delete().in('plan_id', chunk));
  }

  return { deletedCount: deleteIds.length, closedCount: partialIds.length };
};

// Dispatch Completed's "Close Dispatch" — for a Partially Dispatched plan the
// customer won't take the rest of. What already went out stays a real
// dispatch (its stock entries are kept) and the plan is closed at that qty
// as Dispatch Done; the undispatched rest is CANCELLED on the order item
// (cancelPendingQty: cancelled_quantity + a Cancelled history row), so it
// does not come back to Dispatch Planning. Unlike Delete, which sends the
// rest back to Dispatch Planning. Only Partially Dispatched plans qualify.
export const closePartialDispatches = async (planIds, created_by) => {
  const ids = [...new Set(planIds)].filter(Boolean);
  if (ids.length === 0) return { closedCount: 0 };

  const plans = await fetchInChunks(ids, (chunk) =>
    supabase.from('dispatch_plans')
      .select('plan_id, order_item_id, quantity, godown_id, unit_price, dispatch_status')
      .in('plan_id', chunk)
  );
  const notPartial = plans.filter(p => p.dispatch_status !== 'Partially Dispatched');
  if (notPartial.length > 0) {
    throw new Error('Close Dispatch is only for Partially Dispatched plans.');
  }

  const txns = await fetchInChunks(ids, (chunk) =>
    supabase.from('transactions').select('dispatch_plan_id, qty').in('dispatch_plan_id', chunk).eq('is_void', false)
  );
  const dispatchedMap = {};
  txns.forEach(t => { dispatchedMap[t.dispatch_plan_id] = (dispatchedMap[t.dispatch_plan_id] || 0) + Number(t.qty); });

  for (const plan of plans) {
    const dispatched = roundQty(dispatchedMap[plan.plan_id] || 0);
    const leftover = roundQty(Number(plan.quantity) - dispatched);

    const { error } = await supabase
      .from('dispatch_plans')
      .update({ quantity: dispatched, dispatch_status: 'Dispatch Done', updated_at: new Date().toISOString() })
      .eq('plan_id', plan.plan_id);
    if (error) throw error;

    if (leftover > 0) {
      await cancelPendingQty({
        order_item_id: plan.order_item_id,
        cancel_qty: leftover,
        godown_id: plan.godown_id,
        unit_price: plan.unit_price,
        created_by,
        reason: 'Closed from Dispatch Completed (rest of a partial dispatch)',
      });
    }
  }

  return { closedCount: plans.length };
};

export const completeDispatchWithStockOut = async ({ plan_id, product_id, godown_id, quantity, dispatch_date, dispatch_number, created_by }) => {
  const getTodayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Dispatch Planning already allows a future dispatch_date (stock is
  // reduced immediately at planning time, whatever date is picked) — this
  // used to reject completing that same plan with its own future date;
  // now it accepts it, same as planning did.
  const todayLocal = getTodayLocal();
  // Same rule as saveDispatchPlan: the linked transaction's txn_date is
  // capped at today, even if this plan's dispatch_date is still in the
  // future, so it always shows up in Stock Management / Live Stock
  // Dashboard right away instead of sitting on an unreached future date.
  const txnDate = dispatch_date > todayLocal ? todayLocal : dispatch_date;

  // Godown stock is checked and deducted here, at completion — planning
  // only books the dispatch. `quantity` is what actually leaves now, and may
  // be less than the plan (partial dispatch): each completion posts its own
  // OUT_GODOWN entry for just that qty, so stock only ever drops by what was
  // really dispatched. The plan stays "Partially Dispatched" (still listed
  // under Dispatch Completed → Pending) until its full qty has gone out.
  const qty = roundQty(quantity);
  if (!qty || qty <= 0) throw new Error('Enter a valid dispatch quantity.');

  const [{ data: plan, error: planFetchErr }, { data: txns, error: txnFetchErr }] = await Promise.all([
    supabase.from('dispatch_plans').select('quantity, dispatch_status').eq('plan_id', plan_id).single(),
    supabase.from('transactions').select('txn_id, qty, godown_id').eq('dispatch_plan_id', plan_id).eq('is_void', false),
  ]);
  if (planFetchErr) throw planFetchErr;
  if (txnFetchErr) throw txnFetchErr;

  // A plan that hasn't been completed even once can still carry an
  // OUT_GODOWN entry made when it was planned (Direct orders, and plans made
  // before stock moved to this step). That entry was only a reservation —
  // it's replaced below by the real dispatched qty, and counts as available
  // again for the stock check. Once a plan is Partially Dispatched, its
  // entries are real dispatches.
  const isFirstCompletion = plan.dispatch_status !== 'Partially Dispatched';
  const reservedTxns = isFirstCompletion ? (txns || []) : [];
  const dispatchedSoFar = isFirstCompletion ? 0 : (txns || []).reduce((s, t) => s + Number(t.qty), 0);
  const planQty = Number(plan.quantity) || 0;
  const remaining = roundQty(planQty - dispatchedSoFar);
  if (qty > remaining) {
    throw new Error(`Dispatch qty (${qty}) is more than the qty still to dispatch on this plan (${remaining}).`);
  }

  const [{ data: stockRow }, { data: product }] = await Promise.all([
    supabase.from('godown_stock').select('current_stock').eq('product_id', product_id).eq('godown_id', godown_id).maybeSingle(),
    supabase.from('products').select('allow_negative_stock').eq('product_id', product_id).maybeSingle(),
  ]);
  const reservedHere = reservedTxns
    .filter(t => t.godown_id === godown_id)
    .reduce((s, t) => s + Number(t.qty), 0);
  const available = roundQty((Number(stockRow?.current_stock) || 0) + reservedHere);
  if (qty > available && !product?.allow_negative_stock) {
    throw new Error(`Not enough stock in selected godown. Available: ${available}, Required: ${qty}.`);
  }

  if (reservedTxns.length > 0) {
    const { error: delErr } = await supabase.from('transactions').delete().in('txn_id', reservedTxns.map(t => t.txn_id));
    if (delErr) throw delErr;
  }

  const { data: transaction, error: txnErr } = await supabase.from('transactions').insert([{
    product_id,
    godown_id,
    txn_date: txnDate,
    txn_type: 'OUT_GODOWN',
    qty,
    is_void: false,
    created_by,
    back_dated: new Date(dispatch_date) < new Date(new Date().toDateString()),
    dispatch_plan_id: plan_id,
    dispatch_number,
  }]).select().single();
  if (txnErr) throw txnErr;

  const totalDispatched = roundQty(dispatchedSoFar + qty);
  const isFullyDone = totalDispatched >= planQty;
  const { error: planErr } = await supabase
    .from('dispatch_plans')
    .update({
      dispatch_status: isFullyDone ? 'Dispatch Done' : 'Partially Dispatched',
      godown_id,
      updated_at: new Date().toISOString(),
    })
    .eq('plan_id', plan_id);
  if (planErr) throw planErr;

  return { transaction, plan_id, dispatched_qty: qty, total_dispatched: totalDispatched, is_fully_done: isFullyDone };
};

// One "dispatch_confirmation" WhatsApp per customer + dispatch date, listing
// every product dispatched to them that day grouped by product group.
// Returns one { plan_id, sent, reason? } per plan.
const notifyDispatchConfirmations = async (planIds, qtyByPlan = {}) => {
  const { data: rawPlans, error } = await supabase
    .from('dispatch_plans')
    .select(`
      plan_id, quantity, dispatch_date,
      sales_order_items!inner(
        products:product_id(name, unit, mux, brand_name, category, group_id, product_groups:group_id(group_name)),
        sales_orders!inner(customer_id, customers:customer_id(name, phone_number))
      )
    `)
    .in('plan_id', planIds);
  if (error) {
    console.error('WhatsApp dispatch confirmation failed:', error.message);
    return planIds.map(plan_id => ({ plan_id, sent: false, reason: error.message }));
  }
  const plans = (rawPlans || []).map(p =>
    qtyByPlan[p.plan_id] != null ? { ...p, quantity: qtyByPlan[p.plan_id] } : p
  );

  const byCustomerDate = new Map();
  (plans || []).forEach(plan => {
    const order = plan.sales_order_items?.sales_orders;
    const key = `${order?.customer_id || ''}|${plan.dispatch_date || ''}`;
    if (!byCustomerDate.has(key)) byCustomerDate.set(key, []);
    byCustomerDate.get(key).push(plan);
  });

  const results = [];
  const found = new Set((plans || []).map(p => p.plan_id));
  planIds.filter(id => !found.has(id)).forEach(plan_id => results.push({ plan_id, sent: false, reason: 'Dispatch plan not found' }));

  for (const group of byCustomerDate.values()) {
    const customer = group[0].sales_order_items?.sales_orders?.customers;
    const markAll = (result) => group.forEach(p => results.push({ plan_id: p.plan_id, ...result }));
    if (!customer?.phone_number) { markAll({ sent: false, reason: 'no_phone' }); continue; }
    try {
      const { entries, totalLabel } = buildDispatchEntries(group);
      const dispatchDate = group[0].dispatch_date;
      await sendDispatchConfirmationWhatsapp({
        phone: customer.phone_number,
        date: formatLongDate(new Date()),
        customerName: customer.name,
        lotQty: totalLabel,
        dispatchDate: dispatchDate ? formatLongDate(new Date(dispatchDate)) : '-',
        productEntries: entries,
        totalQty: totalLabel,
      });
      markAll({ sent: true });
    } catch (err) {
      console.error('WhatsApp dispatch confirmation failed:', err.message);
      markAll({ sent: false, reason: err.message });
    }
  }
  return results;
};

// "30 September 2026"
const formatLongDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// Plan quantity is in the product's master unit; Bag/Kg products are shown in
// bags (Kg converted via the product's Pkg/Bag size), anything else in its own
// unit. One entry per product group — the first product with its full name,
// later ones without the repeated group prefix:
// Single product:   "test amit 12×12 (40 Kg) - Bags: 45"
// Several products: "Tuleshwar Developer 6×11 (68 Kg) - 78 Bags | 7×7 (32 Kg) - 45 Bags"
const buildDispatchEntries = (plans) => {
  const totals = new Map(); // unit label → qty
  const addTotal = (unit, qty) => totals.set(unit, (totals.get(unit) || 0) + qty);

  const byGroup = new Map();
  plans.forEach(plan => {
    const item = plan.sales_order_items;
    const gName = getGroupNameFromItem(item);
    const key = gName && gName !== '—' ? gName : (item?.products?.name || 'Product');
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(plan);
  });

  const entries = [...byGroup.entries()].map(([gName, groupPlans]) => {
    const safeGroup = toWhatsappSafeName(gName);
    const lines = groupPlans.map((plan, idx) => {
      const product = plan.sales_order_items?.products || {};
      const name = toWhatsappSafeName(product.name || 'Product');
      const label = idx > 0 ? stripGroupPrefix(name, safeGroup) : name;
      const unit = String(product.unit || '').toLowerCase();
      const qty = Number(plan.quantity) || 0;
      let amount = qty;
      let unitLabel = product.unit || '';
      if (unit === 'bag' || unit === 'kg') {
        const pkg = getPackagingSize(product);
        amount = unit === 'kg' && pkg > 0 ? qty / pkg : qty;
        unitLabel = 'Bags';
      }
      addTotal(unitLabel.toLowerCase(), amount);
      return { label, amount, unitLabel };
    });

    if (lines.length === 1) {
      const { label, amount, unitLabel } = lines[0];
      return `${label} - ${unitLabel}: ${formatWaNumber(amount)}`;
    }
    return lines.map(({ label, amount, unitLabel }) => `${label} - ${formatWaNumber(amount)} ${unitLabel}`).join(' | ');
  });

  const totalLabel = [...totals.entries()]
    .map(([unit, qty]) => `${formatWaNumber(qty)}${unit ? ` ${unit}` : ''}`)
    .join(' + ');
  return { entries, totalLabel };
};

export const isOrderLocked = async (order_id) => {
  const { data: items, error: itemsErr } = await supabase
    .from('sales_order_items')
    .select('item_id')
    .eq('order_id', order_id);
  if (itemsErr) throw itemsErr;
  if (!items || items.length === 0) return false;

  const itemIds = items.map(i => i.item_id);
  const { data: plans, error: plansErr } = await supabase
    .from('dispatch_plans')
    .select('plan_id')
    .in('order_item_id', itemIds)
    .eq('dispatch_status', 'Dispatch Done')
    .limit(1);
  if (plansErr) throw plansErr;

  return (plans || []).length > 0;
};

// Customer-wise dashboard feed for the LiveStockDashboard "Sales Dashboard"
// view — mirrors purchaseService.getVendorDashboardData's shape/logic
// (one row per order item, flattened) so the two dashboards read the same
// way, with dispatch_plans standing in for purchase_deliveries:
//   - plannedQty   = total qty across all non-cancelled dispatch plans
//                    (the "has this been picked up for dispatch" analog of
//                    liftQty — stock is deducted as soon as a plan is saved)
//   - dispatchedQty = qty across plans whose dispatch_status is the final
//                    'Dispatch Done' state (the "actually left the godown,
//                    for good" analog of deliveryQty's Arrived/Received)
//   - netQty       = ordered quantity minus whatever's been formally
//                    cancelled off that item (sales_order_items.cancelled_quantity
//                    has no purchase-side equivalent, so there's no netQty
//                    fallback needed there)
//   - pendingQty   = max(0, netQty - dispatchedQty)
export const getCustomerDashboardData = async (signal) => {
  const data = await fetchAllRows(() => supabase
    .from('sales_orders')
    .select(`
      order_id,
      order_number,
      order_date,
      customer_id,
      created_by,
      is_void,
      users:created_by(full_name),
      customers:customer_id(customer_id, name, rank_id, ranks:rank_id(rank_id, rank_name)),
      sales_order_items(
        item_id,
        quantity,
        cancelled_quantity,
        unit_price,
        products:product_id(
          product_id,
          name,
          unit,
          group_id,
          product_groups:group_id(group_id, group_name, rank_rates)
        ),
        dispatch_plans(
          plan_id,
          quantity,
          dispatch_status,
          dispatch_date,
          cancelled_reason
        )
      )
    `)
    .eq('is_void', false)
    .order('created_at', { ascending: false })
    .abortSignal(signal));

  const rows = [];
  for (const order of data || []) {
    const orderNo = order.order_number || '—';
    const orderDate = order.order_date ? String(order.order_date).split('T')[0] : '—';
    const customerId = order.customer_id || order.customers?.customer_id || null;
    const customerName = order.customers?.name || 'Unassigned Customer';
    const customerRank = order.customers?.ranks?.rank_name || null;
    const createdBy = order.users?.full_name || 'Admin';

    for (const item of order.sales_order_items || []) {
      const prod = item.products;
      const productId = prod?.product_id || item.product_id;
      const productName = prod?.name || 'Unassigned Product';
      const unit = prod?.unit || 'Kg';
      const groupId = prod?.group_id || prod?.product_groups?.group_id || null;
      const groupName = prod?.product_groups?.group_name || null;
      const rankRates = prod?.product_groups?.rank_rates || null;
      const totalQty = Number(item.quantity || 0);
      const cancelledQty = Number(item.cancelled_quantity || 0);
      const netQty = Math.max(0, totalQty - cancelledQty);

      const activePlans = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
      const plannedQty = activePlans.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
      const dispatchedQty = activePlans
        .filter(p => p.dispatch_status === 'Dispatch Done')
        .reduce((sum, p) => sum + Number(p.quantity || 0), 0);
      const pendingQty = Math.max(0, netQty - dispatchedQty);

      const donePlans = activePlans.filter(p => p.dispatch_status === 'Dispatch Done');
      const lastDeliveredDate = donePlans.map(p => p.dispatch_date).filter(Boolean).sort().reverse()[0] || '—';
      const unitPrice = item.unit_price || 0;

      const pendingPlans = activePlans.filter(p => p.dispatch_status !== 'Dispatch Done');
      const expectedDate =
        pendingPlans.map(p => p.dispatch_date).filter(Boolean).sort()[0] ||
        activePlans.map(p => p.dispatch_date).filter(Boolean).sort()[0] ||
        '—';

      const remark = (item.dispatch_plans || [])
        .map(p => p.cancelled_reason)
        .filter(Boolean)
        .join(', ') || '—';

      rows.push({
        id: item.item_id,
        productId,
        orderId: order.order_id,
        orderNo,
        orderDate,
        customerId,
        customerName,
        customerRank,
        productName,
        unit,
        groupId,
        groupName,
        rankRates,
        product: prod || null,
        totalQty,
        netQty,
        createdBy,
        pendingQty,
        plannedQty,
        dispatchedQty,
        expectedDate,
        lastDeliveredDate,
        unitPrice,
        remark,
      });
    }
  }

  return rows;
};

export const cancelOrderItems = async (order_id, items, reason, user_id) => {
  if (!items || items.length === 0) throw new Error('No items selected for cancellation.');
  if (!reason || !reason.trim()) throw new Error('A reason is required for cancellation.');

  const results = [];
  for (const { item_id, cancel_qty } of items) {
    if (!cancel_qty || Number(cancel_qty) <= 0) continue;
    let remainingToCancel = Number(cancel_qty);

    const { data: itemRow } = await supabase
      .from('sales_order_items')
      .select('quantity, cancelled_quantity')
      .eq('item_id', item_id)
      .single();
    if (!itemRow) throw new Error(`Item ${item_id} not found.`);

    const { data: itemPlans } = await supabase
      .from('dispatch_plans')
      .select('*')
      .eq('order_item_id', item_id)
      .neq('dispatch_status', 'Cancelled');
    const itemPlansArr = itemPlans || [];

    const undispatchedPlans = itemPlansArr.filter(p => p.dispatch_status === 'Pending' || p.dispatch_status === 'Planned');
    const dispatchedPlans = itemPlansArr.filter(p => p.dispatch_status === 'Dispatch Done' || p.dispatch_status === 'Partially Dispatched');

    for (const plan of undispatchedPlans) {
      if (remainingToCancel <= 0) break;
      const planQty = Number(plan.quantity);
      const toCancel = Math.min(remainingToCancel, planQty);
      remainingToCancel -= toCancel;

      // Void the planned transaction to restore stock
      const { data: txns } = await supabase
        .from('transactions')
        .select('*')
        .eq('dispatch_plan_id', plan.plan_id)
        .eq('is_void', false);

      for (const txn of txns || []) {
        try {
          await stockVoidTransaction(txn.txn_id, reason.trim(), user_id);
        } catch (err) {
          throw new Error(`Cannot cancel planned dispatch ${plan.dispatch_number || plan.plan_id}: ${err.message}`);
        }
      }

      await supabase
        .from('dispatch_plans')
        .update({
          dispatch_status: 'Cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_reason: reason.trim(),
          cancelled_by: user_id,
          updated_at: new Date().toISOString(),
        })
        .eq('plan_id', plan.plan_id);
    }

    for (const plan of dispatchedPlans) {
      if (remainingToCancel <= 0) break;
      const planQty = Number(plan.quantity);
      const toCancel = Math.min(remainingToCancel, planQty);
      remainingToCancel -= toCancel;

      const { data: txns } = await supabase
        .from('transactions')
        .select('*')
        .eq('dispatch_plan_id', plan.plan_id)
        .eq('is_void', false);

      for (const txn of txns || []) {
        try {
          await stockVoidTransaction(txn.txn_id, reason.trim(), user_id);
        } catch (err) {
          throw new Error(`Cannot cancel dispatched plan ${plan.dispatch_number || plan.plan_id}: ${err.message}`);
        }
      }

      await supabase
        .from('dispatch_plans')
        .update({
          dispatch_status: 'Cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_reason: reason.trim(),
          cancelled_by: user_id,
          updated_at: new Date().toISOString(),
        })
        .eq('plan_id', plan.plan_id);
    }

    const newCancelled = Number(itemRow.cancelled_quantity || 0) + Number(cancel_qty);
    await supabase
      .from('sales_order_items')
      .update({ cancelled_quantity: newCancelled })
      .eq('item_id', item_id);

    results.push({ item_id, cancelled: Number(cancel_qty) });
  }

  if (results.length > 0) {
    const { data: itemIds } = await supabase
      .from('sales_order_items')
      .select('item_id, quantity, cancelled_quantity')
      .eq('order_id', order_id);

    const allFullyCancelled = (itemIds || []).every(
      i => Number(i.cancelled_quantity || 0) >= Number(i.quantity)
    );

    if (allFullyCancelled) {
      await supabase
        .from('sales_orders')
        .update({ is_void: true })
        .eq('order_id', order_id);
    }
  }

  return results;
};
