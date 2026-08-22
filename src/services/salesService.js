import { supabase } from '../supabase';
import { voidTransaction as stockVoidTransaction } from './stockService';
import { sendOrderConfirmationWhatsapp, sendDispatchConfirmationWhatsapp } from './whatsappService';
import { getPackagingSize } from './purchaseService';
import { roundQty } from '../lib/qty';

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

export const generateNextOrderNumber = async () => {
  const { data, error } = await supabase
    .from('sales_orders')
    .select('order_number')
    .like('order_number', 'VPR/OR-%')
    .order('order_number', { ascending: false })
    .limit(1);

  if (error) throw error;

  if (!data || data.length === 0) {
    return 'VPR/OR-001';
  }

  const last = data[0].order_number;
  const match = last.match(/VPR\/OR-(\d+)/);
  if (!match) return 'VPR/OR-001';

  const next = parseInt(match[1], 10) + 1;
  return `VPR/OR-${String(next).padStart(3, '0')}`;
};

export const generateMultipleOrderNumbers = async (count) => {
  if (!count || count <= 0) return [];
  const { data, error } = await supabase
    .from('sales_orders')
    .select('order_number')
    .like('order_number', 'VPR/OR-%')
    .order('order_number', { ascending: false })
    .limit(1);

  if (error) throw error;

  let startNum = 1;
  if (data && data.length > 0) {
    const last = data[0].order_number;
    const match = last.match(/VPR\/OR-(\d+)/);
    if (match) {
      startNum = parseInt(match[1], 10) + 1;
    }
  }

  const numbers = [];
  for (let i = 0; i < count; i++) {
    numbers.push(`VPR/OR-${String(startNum + i).padStart(3, '0')}`);
  }
  return numbers;
};

export const getProductCurrentStockAndTransit = async (productIds) => {
  if (!productIds || productIds.length === 0) return { stockMap: {}, transitMap: {} };
  
  // Current Stock (from transactions)
  const { data: txns } = await supabase
    .from('transactions')
    .select('product_id, qty, txn_type')
    .eq('is_void', false)
    .in('product_id', productIds);

  const stockMap = {};
  for (const txn of txns || []) {
    if (!stockMap[txn.product_id]) stockMap[txn.product_id] = 0;
    if (['OPEN_STOCK', 'IN_FACTORY', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PURCHASE_IN', 'PURCHASE_IN(TPT)'].includes(txn.txn_type)) {
      stockMap[txn.product_id] += Number(txn.qty);
    } else {
      stockMap[txn.product_id] -= Number(txn.qty);
    }
  }

  // In Transit — lifts not yet Arrived/Received. purchase_deliveries has no
  // product_id/dispatch_qty/arrived_qty columns of its own; product comes
  // through purchase_indent_items, and the lift's qty is received_quantity.
  const { data: transit, error: transitErr } = await supabase
    .from('purchase_deliveries')
    .select('received_quantity, status, purchase_indent_items!inner(product_id)')
    .in('status', ['In Transit', 'In Transport Godown', 'AT TPT GDN'])
    .in('purchase_indent_items.product_id', productIds);
  if (transitErr) throw transitErr;

  const transitMap = {};
  for (const t of transit || []) {
    const pid = t.purchase_indent_items?.product_id;
    if (!pid) continue;
    transitMap[pid] = (transitMap[pid] || 0) + Number(t.received_quantity || 0);
  }

  return { stockMap, transitMap };
};

export const getAllOrders = async () => {
  const { data: orders, error: ordersErr } = await supabase
    .from('sales_orders')
    .select('*, process_type, customers:customer_id(name), sales_order_items(*, products:product_id(name, unit), godowns:godown_id(name))')
    .order('created_at', { ascending: false });
  if (ordersErr) throw ordersErr;
  if (!orders || orders.length === 0) return [];

  const itemIds = orders.flatMap(o => (o.sales_order_items || []).map(i => i.item_id));
  if (itemIds.length === 0) return orders;

  const { data: plans, error: plansErr } = await supabase
    .from('dispatch_plans')
    .select('*')
    .in('order_item_id', itemIds);
  if (plansErr) throw plansErr;

  const planIds = (plans || []).map(p => p.plan_id).filter(Boolean);
  const dispatchedMap = {};
  if (planIds.length > 0) {
    const { data: txns } = await supabase
      .from('transactions')
      .select('dispatch_plan_id, qty')
      .in('dispatch_plan_id', planIds)
      .eq('is_void', false);
    (txns || []).forEach(t => {
      dispatchedMap[t.dispatch_plan_id] = (dispatchedMap[t.dispatch_plan_id] || 0) + Number(t.qty);
    });
  }

  const planMap = {};
  (plans || []).forEach(p => {
    if (!planMap[p.order_item_id]) planMap[p.order_item_id] = [];
    planMap[p.order_item_id].push({ ...p, already_dispatched: dispatchedMap[p.plan_id] || 0 });
  });

  return orders.map(o => ({
    ...o,
    sales_order_items: (o.sales_order_items || []).map(i => ({
      ...i,
      dispatch_plans: planMap[i.item_id] || [],
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
      godown_id: item.godown_id,
      unit_price: Number(item.unit_price),
      quantity: Number(item.quantity),
    }));
    const { error: itemErr } = await supabase
      .from('sales_order_items')
      .insert(itemRows);
    if (itemErr) throw itemErr;
  }

  if (notify_customer) {
    notifyOrderConfirmation(customer_id, items).catch(err => {
      console.error('WhatsApp order confirmation failed:', err.message);
    });
  }

  return order;
};

const notifyOrderConfirmation = async (customer_id, items) => {
  const { data: customer } = await supabase
    .from('customers')
    .select('name, phone_number')
    .eq('customer_id', customer_id)
    .single();
  if (!customer?.phone_number) return;

  const productIds = [...new Set(items.map(i => i.product_id))];
  const { data: productRows } = await supabase
    .from('products')
    .select('product_id, name')
    .in('product_id', productIds);
  const nameMap = {};
  (productRows || []).forEach(p => { nameMap[p.product_id] = p.name; });

  const itemDetails = items
    .map(i => `${nameMap[i.product_id] || 'Item'} x ${Number(i.quantity)}`)
    .join(', ');
  const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  await sendOrderConfirmationWhatsapp({
    phone: customer.phone_number,
    customerName: customer.name,
    itemDetails,
    totalQty,
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
          godown_id: item.godown_id,
          unit_price: Number(item.unit_price),
          quantity: Number(item.quantity),
        })
        .eq('item_id', item.item_id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase
        .from('sales_order_items')
        .insert({
          order_id,
          product_id: item.product_id,
          godown_id: item.godown_id,
          unit_price: Number(item.unit_price),
          quantity: Number(item.quantity),
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
    notifyOrderConfirmation(customer_id, items).catch(err => {
      console.error('WhatsApp order confirmation failed:', err.message);
    });
  }
};

export const getAllOrderItemsForDispatch = async () => {
  const { data: items, error: itemsErr } = await supabase
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
    .order('created_at', { ascending: false });
  if (itemsErr) throw itemsErr;
  if (!items || items.length === 0) return [];

  const ids = items.map(i => i.item_id);
  const { data: plans, error: plansErr } = await supabase
    .from('dispatch_plans')
    .select('*')
    .in('order_item_id', ids);
  if (plansErr) throw plansErr;

  const planIds = (plans || []).map(p => p.plan_id).filter(Boolean);
  const dispatchedMap = {};
  if (planIds.length > 0) {
    const { data: txns } = await supabase
      .from('transactions')
      .select('dispatch_plan_id, qty')
      .in('dispatch_plan_id', planIds)
      .eq('is_void', false);
    (txns || []).forEach(t => {
      dispatchedMap[t.dispatch_plan_id] = (dispatchedMap[t.dispatch_plan_id] || 0) + Number(t.qty);
    });
  }

  const planMap = {};
  (plans || []).forEach(p => {
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
  const { data: items, error: itemsErr } = await supabase
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
    .order('created_at', { ascending: false });
  if (itemsErr) throw itemsErr;
  if (!items || items.length === 0) return [];

  const ids = items.map(i => i.item_id);
  const { data: plans, error: plansErr } = await supabase
    .from('dispatch_plans')
    .select('*, users:created_by(full_name)')
    .in('order_item_id', ids);
  if (plansErr) throw plansErr;

  const planIds = (plans || []).map(p => p.plan_id).filter(Boolean);
  const dispatchedMap = {};
  if (planIds.length > 0) {
    const { data: txns } = await supabase
      .from('transactions')
      .select('dispatch_plan_id, qty')
      .in('dispatch_plan_id', planIds)
      .eq('is_void', false);
    (txns || []).forEach(t => {
      dispatchedMap[t.dispatch_plan_id] = (dispatchedMap[t.dispatch_plan_id] || 0) + Number(t.qty);
    });
  }

  const planMap = {};
  (plans || []).forEach(p => {
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
  const { data, error } = await supabase
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
    .order('created_at', { ascending: false });

  if (error) throw error;
  const plansData = data || [];
  const planIds = plansData.map(p => p.plan_id).filter(Boolean);
  if (planIds.length > 0) {
    const { data: txns } = await supabase
      .from('transactions')
      .select('dispatch_plan_id, qty')
      .in('dispatch_plan_id', planIds)
      .eq('is_void', false);
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

export const generateNextDispatchNumber = async () => {
  const { data, error } = await supabase
    .from('dispatch_plans')
    .select('dispatch_number')
    .like('dispatch_number', 'DN-%')
    .order('dispatch_number', { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0 || !data[0].dispatch_number) return 'DN-0001';

  const last = data[0].dispatch_number;
  const match = last.match(/DN-(\d+)/);
  if (!match) return 'DN-0001';

  const next = parseInt(match[1], 10) + 1;
  return `DN-${String(next).padStart(4, '0')}`;
};

const PG_UNIQUE_VIOLATION = '23505';

export const saveDispatchPlan = async ({ plan_id, order_item_id, quantity, unit, converted_qty, godown_id, unit_price, dispatch_date, created_by, dispatch_status }) => {
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

  if (plan_id) {
    const { data: existing } = await supabase.from('dispatch_plans').select('dispatch_number, quantity, godown_id').eq('plan_id', plan_id).single();
    payload.dispatch_number = existing?.dispatch_number;
    if (existing) payload.created_by = created_by;

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
        txn_date: dispatch_date,
        back_dated
      }).eq('txn_id', existingTxn.txn_id);
    } else {
       await supabase.from('transactions').insert([{
         product_id,
         godown_id,
         txn_date: dispatch_date,
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

  const { data: stockRow } = await supabase.from('godown_stock').select('current_stock').eq('product_id', product_id).eq('godown_id', godown_id).maybeSingle();
  const available = stockRow?.current_stock ?? 0;
  if (available < stockQty && !product?.allow_negative_stock) {
    throw new Error(`Insufficient stock. Available: ${available}, Required: ${stockQty}.`);
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

  await supabase.from('transactions').insert([{
    product_id,
    godown_id,
    txn_date: dispatch_date,
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

export const batchUpdateInformAfterDispatch = async (planIds, inform_after_dispatch) => {
  if (!planIds || planIds.length === 0) return { plans: [], notifyResults: [] };
  const { data, error } = await supabase
    .from('dispatch_plans')
    .update({ inform_after_dispatch, updated_at: new Date().toISOString() })
    .in('plan_id', planIds)
    .select();
  if (error) throw error;

  // Real WhatsApp sends, one per plan — awaited (not fire-and-forget) so
  // callers can see and surface which notifications actually went out,
  // instead of the "Informed" flag silently disagreeing with what the
  // customer actually received.
  let notifyResults = [];
  if (inform_after_dispatch === 'Informed') {
    notifyResults = await Promise.all(planIds.map(async (plan_id) => {
      try {
        const result = await notifyDispatchConfirmation(plan_id);
        return { plan_id, ...result };
      } catch (err) {
        console.error('WhatsApp dispatch confirmation failed:', err.message);
        return { plan_id, sent: false, reason: err.message };
      }
    }));
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

export const completeDispatchWithStockOut = async ({ plan_id, product_id, godown_id, quantity, dispatch_date, dispatch_number, created_by }) => {
  const getTodayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const todayLocal = getTodayLocal();
  if (dispatch_date > todayLocal) {
    throw new Error('Dispatch date cannot be in the future.');
  }

  // Stock deduction is now handled in saveDispatchPlan during planning.
  // Here we only need to adjust the existing transaction if the actual dispatched quantity is different.
  const { data: existingTxn } = await supabase
    .from('transactions')
    .select('txn_id, qty')
    .eq('dispatch_plan_id', plan_id)
    .eq('is_void', false)
    .maybeSingle();

  if (existingTxn && existingTxn.qty !== Number(quantity)) {
     await supabase.from('transactions').update({
        qty: Number(quantity),
        txn_date: dispatch_date
     }).eq('txn_id', existingTxn.txn_id);
  } else if (!existingTxn) {
     // Fallback if somehow there is no transaction (e.g. legacy plan)
     await supabase.from('transactions').insert([{
       product_id,
       godown_id,
       txn_date: dispatch_date,
       txn_type: 'OUT_GODOWN',
       qty: Number(quantity),
       is_void: false,
       created_by,
       back_dated: new Date(dispatch_date) < new Date(new Date().toDateString()),
       dispatch_plan_id: plan_id,
       dispatch_number,
     }]);
  }

  const updateFields = {
    dispatch_status: 'Dispatch Done',
    quantity: Number(quantity),
    updated_at: new Date().toISOString(),
  };

  const { error: planErr } = await supabase
    .from('dispatch_plans')
    .update(updateFields)
    .eq('plan_id', plan_id);
  if (planErr) throw planErr;

  return { transaction: existingTxn, plan_id };
};

const notifyDispatchConfirmation = async (plan_id) => {
  const { data: plan } = await supabase
    .from('dispatch_plans')
    .select(`
      quantity, dispatch_date,
      sales_order_items!inner(
        products:product_id(name, unit),
        sales_orders!inner(order_number, customers:customer_id(name, phone_number))
      )
    `)
    .eq('plan_id', plan_id)
    .single();

  const order = plan?.sales_order_items?.sales_orders;
  const customer = order?.customers;
  if (!customer?.phone_number) return { sent: false, reason: 'no_phone' };

  const product = plan.sales_order_items.products;
  const unit = product?.unit || '';
  const productDetails = `${product?.name || 'Item'} x ${Number(plan.quantity)}${unit ? ' ' + unit : ''}`;
  const formattedDate = plan.dispatch_date
    ? new Date(plan.dispatch_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-';

  await sendDispatchConfirmationWhatsapp({
    phone: customer.phone_number,
    customerName: customer.name,
    orderNumber: order.order_number,
    productDetails,
    dispatchDate: formattedDate,
    totalQty: Number(plan.quantity),
  });
  return { sent: true };
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
  const { data, error } = await supabase
    .from('sales_orders')
    .select(`
      order_id,
      order_number,
      order_date,
      created_by,
      is_void,
      users:created_by(full_name),
      customers:customer_id(name),
      sales_order_items(
        item_id,
        quantity,
        cancelled_quantity,
        unit_price,
        products:product_id(product_id, name, unit),
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
    .abortSignal(signal);

  if (error) throw error;

  const rows = [];
  for (const order of data || []) {
    const orderNo = order.order_number || '—';
    const orderDate = order.order_date ? String(order.order_date).split('T')[0] : '—';
    const customerName = order.customers?.name || 'Unassigned Customer';
    const createdBy = order.users?.full_name || 'Admin';

    for (const item of order.sales_order_items || []) {
      const productId = item.products?.product_id || item.product_id;
      const productName = item.products?.name || 'Unassigned Product';
      const unit = item.products?.unit || 'Kg';
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
        customerName,
        productName,
        unit,
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
