import { supabase } from '../supabase';

const getTodayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// While a lift is sitting "In Transport Godown," its stock should be tracked
// against the transporter's own linked godown (godown_id === transporter_id, set
// up when the transporter was created) — not the planned final destination godown.
// That destination only takes effect once the lift is marked Arrived.
const resolveGodownAllocations = (godown_allocations, status, transporter_id) => {
  if (status === 'In Transport Godown' && transporter_id) {
    const totalQty = godown_allocations.reduce((s, a) => s + Number(a.qty), 0);
    return [{ godown_id: transporter_id, qty: totalQty }];
  }
  return godown_allocations;
};

// Finds the non-void ledger transaction already recorded for this specific
// lift + godown + type (correlated by lifting_number, the one stable ID a
// lift carries across status changes), so re-saves update it instead of
// inserting a duplicate stock-in.
const findLiftTransaction = async (lifting_number, godown_id, txn_type) => {
  if (!lifting_number || !godown_id) return null;
  const { data, error } = await supabase
    .from('transactions')
    .select('txn_id, qty')
    .eq('lifting_number', lifting_number)
    .eq('godown_id', godown_id)
    .eq('txn_type', txn_type)
    .eq('is_void', false)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
};

// Records (or, if already recorded, updates the quantity of) a real PURCHASE_IN
// stock-in for a lift at the given godown. Used both for a real destination
// godown (Arrived) and for a transporter's own godown (AT TPT GDN).
const ensureLiftPurchaseIn = async ({ product_id, godown_id, qty, txn_date, lifting_number, lr_number, vehicle_number, created_by, back_dated }) => {
  const existing = await findLiftTransaction(lifting_number, godown_id, 'PURCHASE_IN');
  if (existing) {
    if (Number(existing.qty) !== Number(qty)) {
      const { error } = await supabase.from('transactions').update({ qty: Number(qty) }).eq('txn_id', existing.txn_id);
      if (error) throw error;
    }
    return;
  }
  const { error } = await supabase.from('transactions').insert([{
    product_id, godown_id, txn_date, txn_type: 'PURCHASE_IN', qty: Number(qty),
    is_void: false, created_by, back_dated,
    lr_number: lr_number || null, vehicle_number: vehicle_number || null, lifting_number,
  }]);
  if (error) throw error;
};

// Voids a previously-recorded PURCHASE_IN for a lift at a given godown — used
// when a lift moves off that godown (reverted status, or moved on to Arrived).
const voidLiftTransaction = async (lifting_number, godown_id, txn_type, reason) => {
  const existing = await findLiftTransaction(lifting_number, godown_id, txn_type);
  if (!existing) return;
  const { error } = await supabase
    .from('transactions')
    .update({ is_void: true, void_reason: reason })
    .eq('txn_id', existing.txn_id);
  if (error) throw error;
};

export const generateNextIndentNumber = async () => {
  const { data, error } = await supabase
    .from('purchase_indents')
    .select('indent_number')
    .like('indent_number', 'VPR/IN-%')
    .order('indent_number', { ascending: false })
    .limit(1);

  if (error) throw error;

  if (!data || data.length === 0) {
    return 'VPR/IN-001';
  }

  const last = data[0].indent_number;
  const match = last.match(/VPR\/IN-(\d+)/);
  if (!match) return 'VPR/IN-001';

  const next = parseInt(match[1], 10) + 1;
  return `VPR/IN-${String(next).padStart(3, '0')}`;
};

export const generateMultipleIndentNumbers = async (count) => {
  if (!count || count <= 0) return [];
  const { data, error } = await supabase
    .from('purchase_indents')
    .select('indent_number')
    .like('indent_number', 'VPR/IN-%')
    .order('indent_number', { ascending: false })
    .limit(1);

  if (error) throw error;

  let startNum = 1;
  if (data && data.length > 0) {
    const last = data[0].indent_number;
    const match = last.match(/VPR\/IN-(\d+)/);
    if (match) {
      startNum = parseInt(match[1], 10) + 1;
    }
  }

  const numbers = [];
  for (let i = 0; i < count; i++) {
    numbers.push(`VPR/IN-${String(startNum + i).padStart(3, '0')}`);
  }
  return numbers;
};

export const getAllIndents = async () => {
  const { data: indents, error: indentsErr } = await supabase
    .from('purchase_indents')
    .select(`
      *,
      godowns:godown_id(name),
      vendors:vendor_id(name),
      purchase_indent_items(*, products:product_id(name, unit))
    `)
    .order('created_at', { ascending: false });

  if (indentsErr) throw indentsErr;

  const allItems = (indents || []).flatMap(o => o.purchase_indent_items || []);
  const itemIds = allItems.map(i => i.item_id).filter(Boolean);

  let deliverySums = [];
  if (itemIds.length > 0) {
    const { data: sums, error: sumsErr } = await supabase
      .from('purchase_deliveries')
      .select('item_id, received_quantity')
      .eq('status', 'Arrived')
      .in('item_id', itemIds);
    if (sumsErr) throw sumsErr;
    deliverySums = sums || [];
  }

  const sumMap = {};
  deliverySums.forEach(d => {
    sumMap[d.item_id] = (sumMap[d.item_id] || 0) + Number(d.received_quantity);
  });

  return (indents || []).map(indent => ({
    ...indent,
    purchase_indent_items: (indent.purchase_indent_items || []).map(item => {
      const received_qty = sumMap[item.item_id] || 0;
      return {
        ...item,
        received_qty,
        remaining_qty: Math.max(0, Number(item.quantity) - received_qty),
      };
    }),
  }));
};

export const createIndent = async ({ indent_date, indent_number, godown_id, vendor_id, remarks, items, created_by, process_type }) => {
  const total = items.reduce((sum, item) => sum + (Number(item.rate) || 0) * (Number(item.quantity) || 0), 0);

  const { data: indent, error: indentErr } = await supabase
    .from('purchase_indents')
    .insert([{ indent_date, indent_number, godown_id, vendor_id, remarks, total_amount: total, created_by, process_type: process_type || 'process' }])
    .select()
    .single();
  if (indentErr) throw indentErr;

  // Direct indents skip the Dispatch Day / Vendor Approval workflow entirely —
  // the vendor is already fixed at indent creation, so items go straight to
  // Delivery's Pending list instead of waiting to be planned/approved first.
  const isDirect = (process_type || 'process') === 'direct';

  if (items.length > 0) {
    const itemRows = items.map(item => ({
      indent_id: indent.indent_id,
      product_id: item.product_id,
      quantity: Number(item.quantity),
      rate: Number(item.rate),
      ...(isDirect ? { vendor_id, approval_status: 'Approved', planning_status: 'Planned', approved_by: created_by || null } : {}),
    }));
    const { error: itemErr } = await supabase
      .from('purchase_indent_items')
      .insert(itemRows);
    if (itemErr) throw itemErr;
  }

  return indent;
};



export const updateIndent = async (indent_id, { indent_date, indent_number, godown_id, vendor_id, remarks, items, process_type, user_id }) => {
  const total = items.reduce((sum, item) => sum + (Number(item.rate) || 0) * (Number(item.quantity) || 0), 0);

  const updateFields = { indent_date, indent_number, godown_id, vendor_id, remarks, total_amount: total };
  if (process_type !== undefined) updateFields.process_type = process_type;

  const { error: indentErr } = await supabase
    .from('purchase_indents')
    .update(updateFields)
    .eq('indent_id', indent_id);
  if (indentErr) throw indentErr;

  // Direct indents skip the Dispatch Day / Vendor Approval workflow entirely —
  // resolve the indent's effective process_type (it may not have been passed
  // in this call) so items land in the right place either way.
  let effectiveProcessType = process_type;
  if (effectiveProcessType === undefined) {
    const { data: existingIndent } = await supabase
      .from('purchase_indents')
      .select('process_type')
      .eq('indent_id', indent_id)
      .single();
    effectiveProcessType = existingIndent?.process_type || 'process';
  }
  const isDirect = effectiveProcessType === 'direct';

  const { data: existingIds, error: fetchErr } = await supabase
    .from('purchase_indent_items')
    .select('item_id')
    .eq('indent_id', indent_id);
  if (fetchErr) throw fetchErr;

  const incomingIds = new Set(items.filter(i => i.item_id).map(i => i.item_id));

  for (const item of items) {
    if (item.item_id && incomingIds.has(item.item_id)) {
      const { error: updErr } = await supabase
        .from('purchase_indent_items')
        .update({
          product_id: item.product_id,
          quantity: Number(item.quantity),
          rate: Number(item.rate),
        })
        .eq('item_id', item.item_id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase
        .from('purchase_indent_items')
        .insert({
          indent_id,
          product_id: item.product_id,
          quantity: Number(item.quantity),
          rate: Number(item.rate),
        });
      if (insErr) throw insErr;
    }
  }

  for (const existing of existingIds || []) {
    if (incomingIds.has(existing.item_id)) continue;
    const { error: delErr } = await supabase
      .from('purchase_indent_items')
      .delete()
      .eq('item_id', existing.item_id);
    if (delErr) throw delErr;
  }

  // Make sure every remaining item under this indent — including ones
  // untouched by this edit — reflects Direct's "already approved" status,
  // so they all show up in Delivery's Pending list right away.
  if (isDirect) {
    const directFields = { vendor_id, approval_status: 'Approved', planning_status: 'Planned' };
    if (user_id) directFields.approved_by = user_id;
    const { error: directErr } = await supabase
      .from('purchase_indent_items')
      .update(directFields)
      .eq('indent_id', indent_id);
    if (directErr) throw directErr;
  }
};

export const voidIndent = async (indent_id) => {
  const { error } = await supabase
    .from('purchase_indents')
    .update({ is_void: true })
    .eq('indent_id', indent_id);
  if (error) throw error;
};

export const deleteIndent = async (indent_id) => {
  // 1. Get all item_ids for this indent
  const { data: items, error: fetchErr } = await supabase
    .from('purchase_indent_items')
    .select('item_id')
    .eq('indent_id', indent_id);
  if (fetchErr) throw fetchErr;

  const itemIds = (items || []).map(i => i.item_id);

  if (itemIds.length > 0) {
    // 2. Get all delivery_ids for these items
    const { data: deliveries, error: delFetchErr } = await supabase
      .from('purchase_deliveries')
      .select('delivery_id')
      .in('item_id', itemIds);
    if (delFetchErr) throw delFetchErr;

    const deliveryIds = (deliveries || []).map(d => d.delivery_id);

    if (deliveryIds.length > 0) {
      // 3. Delete godown allocations for those deliveries
      const { error: gdErr } = await supabase
        .from('purchase_delivery_godowns')
        .delete()
        .in('delivery_id', deliveryIds);
      if (gdErr) throw gdErr;

      // 4. Delete the deliveries themselves
      const { error: delErr } = await supabase
        .from('purchase_deliveries')
        .delete()
        .in('delivery_id', deliveryIds);
      if (delErr) throw delErr;
    }
  }

  // 5. Delete indent items
  const { error: itemErr } = await supabase
    .from('purchase_indent_items')
    .delete()
    .eq('indent_id', indent_id);
  if (itemErr) throw itemErr;

  // 6. Delete the indent itself
  const { error } = await supabase
    .from('purchase_indents')
    .delete()
    .eq('indent_id', indent_id);
  if (error) throw error;
};

export const getAllIndentItemsForVendorSelection = async () => {
  const { data: items, error: itemsErr } = await supabase
    .from('purchase_indent_items')
    .select(`
      *,
      products:product_id(name, unit),
      purchase_indents!inner(
        indent_id, indent_date, indent_number, godown_id, vendor_id, remarks, process_type,
        godowns:godown_id(name),
        vendors:vendor_id(name)
      )
    `)
    .eq('purchase_indents.process_type', 'process')
    .order('created_at', { ascending: false });

  if (itemsErr) throw itemsErr;
  return items || [];
};

export const updateVendorSelection = async (item_id, { vendor_id, approved_godown_id, rate, quantity, planning_date, vendor_remarks, planning_status, approval_status, approved_by }) => {
  const updateFields = {};
  if (vendor_id !== undefined) updateFields.vendor_id = vendor_id;
  if (approved_godown_id !== undefined) updateFields.approved_godown_id = approved_godown_id;
  if (rate !== undefined) updateFields.rate = Number(rate);
  if (quantity !== undefined) updateFields.quantity = Number(quantity);
  if (planning_date !== undefined) updateFields.planning_date = planning_date;
  if (vendor_remarks !== undefined) updateFields.vendor_remarks = vendor_remarks;
  if (planning_status !== undefined) updateFields.planning_status = planning_status;
  if (approval_status !== undefined) updateFields.approval_status = approval_status;
  if (approved_by !== undefined) updateFields.approved_by = approved_by;

  const { error } = await supabase
    .from('purchase_indent_items')
    .update(updateFields)
    .eq('item_id', item_id);
  if (error) throw error;
};

export const getIndentsForApproval = async () => {
  const { data: indents, error: indentsErr } = await supabase
    .from('purchase_indents')
    .select(`
      *,
      godowns:godown_id(name),
      vendors:vendor_id(name),
      purchase_indent_items(
        *,
        products:product_id(name, unit),
        item_vendor:vendor_id(name)
      )
    `)
    .eq('purchase_indent_items.planning_status', 'Planned')
    .eq('process_type', 'process')
    .order('created_at', { ascending: false });

  if (indentsErr) throw indentsErr;

  const filtered = (indents || [])
    .map(indent => ({
      ...indent,
      purchase_indent_items: (indent.purchase_indent_items || [])
        .filter(item => item.planning_status === 'Planned'),
    }))
    .filter(indent => indent.purchase_indent_items.length > 0);

  return filtered;
};

export const approveIndentItem = async (item_id, { vendor_id, rate, quantity, godown_id, approved_by }) => {
  const updateFields = { approval_status: 'Approved' };
  if (vendor_id !== undefined) updateFields.vendor_id = vendor_id;
  if (rate !== undefined) updateFields.rate = Number(rate);
  if (quantity !== undefined) updateFields.quantity = Number(quantity);
  if (godown_id !== undefined) updateFields.approved_godown_id = godown_id;
  if (approved_by !== undefined) updateFields.approved_by = approved_by;

  const { error } = await supabase
    .from('purchase_indent_items')
    .update(updateFields)
    .eq('item_id', item_id);
  if (error) throw error;
};

export const getApprovedItemsForDelivery = async () => {
  const { data: items, error: itemsErr } = await supabase
    .from('purchase_indent_items')
    .select(`
      *,
      products:product_id(name, unit),
      purchase_indents!inner(
        indent_id, indent_date, indent_number, godown_id, vendor_id, is_void, process_type,
        godowns:godown_id(name),
        vendors:vendor_id(name)
      )
    `)
    .eq('approval_status', 'Approved')
    .in('purchase_indents.process_type', ['process', 'direct'])
    .order('created_at', { ascending: false });

  if (itemsErr) throw itemsErr;

  const itemIds = (items || []).map(i => i.item_id);
  let deliverySums = [];
  let allocatedSums = [];
  if (itemIds.length > 0) {
    const [sumsRes, allocRes] = await Promise.all([
      supabase
        .from('purchase_deliveries')
        .select('item_id, received_quantity')
        .eq('status', 'Arrived')
        .in('item_id', itemIds),
      supabase
        .from('purchase_deliveries')
        .select('item_id, received_quantity, status')
        .in('item_id', itemIds)
    ]);
    if (sumsRes.error) throw sumsRes.error;
    if (allocRes.error) throw allocRes.error;
    deliverySums = sumsRes.data || [];
    allocatedSums = allocRes.data || [];
  }

  const sumMap = {};
  deliverySums.forEach(d => {
    sumMap[d.item_id] = (sumMap[d.item_id] || 0) + Number(d.received_quantity);
  });

  const allocatedMap = {};
  const statusMap = {};
  allocatedSums.forEach(d => {
    allocatedMap[d.item_id] = (allocatedMap[d.item_id] || 0) + Number(d.received_quantity);
    if (!statusMap[d.item_id]) statusMap[d.item_id] = [];
    statusMap[d.item_id].push(d.status);
  });

  return (items || [])
    .filter(item => !item.purchase_indents?.is_void)
    .map(item => {
      const received_qty = sumMap[item.item_id] || 0;
      const allocated_qty = allocatedMap[item.item_id] || 0;
      const remaining_qty = Number(item.quantity) - received_qty;
      const remaining_alloc_qty = Math.max(0, Number(item.quantity) - allocated_qty);
      const liftStatuses = statusMap[item.item_id] || [];

      const hasInTransitLifts = liftStatuses.includes('In Transit');
      const hasInTransportGodownLifts = liftStatuses.includes('In Transport Godown');
      const hasArrivedLifts = liftStatuses.includes('Arrived') || liftStatuses.includes('Received');

      let delivery_status = 'Pending';
      if (received_qty >= Number(item.quantity)) delivery_status = 'Completed';
      else if (received_qty > 0) delivery_status = 'Partial';

      return {
        ...item,
        received_qty,
        allocated_qty,
        remaining_qty: Math.max(0, remaining_qty),
        remaining_alloc_qty,
        hasInTransitLifts,
        hasInTransportGodownLifts,
        hasArrivedLifts,
        delivery_status,
      };
    });
};

export const getDirectItemsForAawak = async () => {
  const { data: items, error: itemsErr } = await supabase
    .from('purchase_indent_items')
    .select(`
      *,
      products:product_id(name, unit),
      item_vendor:vendor_id(name),
      purchase_indents!inner(
        indent_id, indent_date, indent_number, godown_id, vendor_id, is_void, process_type,
        godowns:godown_id(name),
        vendors:vendor_id(name)
      )
    `)
    .eq('purchase_indents.is_void', false)
    .order('created_at', { ascending: false });

  if (itemsErr) throw itemsErr;

  const itemIds = (items || []).map(i => i.item_id);
  let deliverySums = [];
  let allocatedSums = [];
  if (itemIds.length > 0) {
    const [sumsRes, allocRes] = await Promise.all([
      supabase
        .from('purchase_deliveries')
        .select('item_id, received_quantity')
        .eq('status', 'Arrived')
        .in('item_id', itemIds),
      supabase
        .from('purchase_deliveries')
        .select('item_id, received_quantity')
        .neq('status', 'In Transit')
        .in('item_id', itemIds)
    ]);
    if (sumsRes.error) throw sumsRes.error;
    if (allocRes.error) throw allocRes.error;
    deliverySums = sumsRes.data || [];
    allocatedSums = allocRes.data || [];
  }

  const sumMap = {};
  deliverySums.forEach(d => {
    sumMap[d.item_id] = (sumMap[d.item_id] || 0) + Number(d.received_quantity);
  });

  const allocatedMap = {};
  allocatedSums.forEach(d => {
    allocatedMap[d.item_id] = (allocatedMap[d.item_id] || 0) + Number(d.received_quantity);
  });

  return (items || [])
    .map(item => {
      const received_qty = sumMap[item.item_id] || 0;
      const allocated_qty = allocatedMap[item.item_id] || 0;
      const remaining_qty = Number(item.quantity) - received_qty;
      const remaining_alloc_qty = Math.max(0, Number(item.quantity) - allocated_qty);
      let delivery_status = 'Pending';
      if (received_qty >= Number(item.quantity)) delivery_status = 'Completed';
      else if (received_qty > 0) delivery_status = 'Partial';

      return {
        ...item,
        received_qty,
        allocated_qty,
        remaining_qty: Math.max(0, remaining_qty),
        remaining_alloc_qty,
        delivery_status,
      };
    })
    .filter(item => {
      const isDirect = item.purchase_indents?.process_type === 'direct';
      const isSubmittedFromTransit = item.purchase_indents?.process_type === 'process' && item.allocated_qty > 0;
      return (isDirect || isSubmittedFromTransit) && item.remaining_qty > 0;
    });
};

export const generateNextLiftingNumber = async () => {
  const { data, error } = await supabase
    .from('purchase_deliveries')
    .select('lifting_number')
    .like('lifting_number', 'LIFT-%')
    .order('lifting_number', { ascending: false })
    .limit(1);

  if (error) throw error;

  if (!data || data.length === 0 || !data[0].lifting_number) {
    return 'LIFT-0001';
  }

  const last = data[0].lifting_number;
  const match = last.match(/LIFT-(\d+)/);
  if (!match) return 'LIFT-0001';

  const next = parseInt(match[1], 10) + 1;
  return `LIFT-${String(next).padStart(4, '0')}`;
};

export const createDelivery = async ({ item_id, indent_id, delivery_date, expected_delivery_date, godown_allocations, transporter_id, lr_number, vehicle_number, driver_phone_number, remarks, created_by, status }) => {
  const { data: item, error: itemErr } = await supabase
    .from('purchase_indent_items')
    .select(`product_id`)
    .eq('item_id', item_id)
    .single();
  if (itemErr) throw new Error('Item not found.');

  const product_id = item.product_id;
  const lifting_number = await generateNextLiftingNumber();
  const totalQty = godown_allocations.reduce((s, a) => s + Number(a.qty), 0);
  const deliveryStatus = status || 'In Transit';

  if (deliveryStatus === 'Arrived') {
    const today = getTodayLocal();
    if (delivery_date.slice(0, 10) > today) {
      throw new Error('Lifting date cannot be a future date when marking as Arrived.');
    }
  }

  const { data: delivery, error: delErr } = await supabase
    .from('purchase_deliveries')
    .insert([{
      item_id, indent_id, delivery_date,
      expected_delivery_date: expected_delivery_date || null,
      received_quantity: totalQty,
      transporter_id: transporter_id || null,
      lr_number: lr_number || null,
      vehicle_number: vehicle_number || null,
      driver_phone_number: driver_phone_number || null,
      lifting_number,
      status: deliveryStatus,
      remarks: remarks || null,
      created_by,
    }])
    .select()
    .single();
  if (delErr) throw delErr;

  const godownRows = resolveGodownAllocations(godown_allocations, deliveryStatus, transporter_id).map(a => ({
    delivery_id: delivery.delivery_id,
    godown_id: a.godown_id,
    qty: Number(a.qty),
  }));
  const { error: gdErr } = await supabase
    .from('purchase_delivery_godowns')
    .insert(godownRows);
  if (gdErr) throw gdErr;

  const back_dated = delivery_date < getTodayLocal();

  if (deliveryStatus === 'Arrived') {
    const txnRows = godown_allocations.map(a => ({
      product_id, godown_id: a.godown_id, txn_date: delivery_date,
      txn_type: 'PURCHASE_IN', qty: Number(a.qty),
      is_void: false, created_by, back_dated,
      lr_number: lr_number || null,
      vehicle_number: vehicle_number || null,
      lifting_number,
    }));
    const { error: txnErr } = await supabase
      .from('transactions')
      .insert(txnRows);
    if (txnErr) throw txnErr;
  } else if (deliveryStatus === 'In Transport Godown' && transporter_id) {
    // Goods have physically reached the transporter's own godown — that's a
    // real stock-in, same as Arrived is for the final destination.
    await ensureLiftPurchaseIn({
      product_id, godown_id: transporter_id, qty: totalQty, txn_date: delivery_date,
      lifting_number, lr_number, vehicle_number, created_by, back_dated,
    });
  }

  return { ...delivery, lifting_number };
};


export const updateDelivery = async ({ delivery_id, delivery_date, expected_delivery_date, godown_allocations, transporter_id, lr_number, vehicle_number, remarks, status, user_id }) => {
  const { data: delivery, error: fetchErr } = await supabase
    .from('purchase_deliveries')
    .select(`status, item_id, indent_id, lifting_number`)
    .eq('delivery_id', delivery_id)
    .single();
  if (fetchErr) throw new Error('Delivery not found.');

  const oldStatus = delivery.status;
  if (oldStatus === 'Arrived' || oldStatus === 'Received') {
    throw new Error('Cannot edit a delivery that has already arrived.');
  }

  const today = getTodayLocal();
  if (status === 'Arrived' && delivery_date.slice(0, 10) > today) {
    throw new Error('Lifting date cannot be a future date when marking as Arrived.');
  }

  const { data: item, error: itemErr } = await supabase
    .from('purchase_indent_items')
    .select(`product_id`)
    .eq('item_id', delivery.item_id)
    .single();
  if (itemErr) throw new Error('Item not found.');

  const totalQty = godown_allocations.reduce((s, a) => s + Number(a.qty), 0);

  const { error: updErr } = await supabase
    .from('purchase_deliveries')
    .update({
      delivery_date,
      expected_delivery_date: expected_delivery_date || null,
      received_quantity: totalQty,
      transporter_id: transporter_id || null,
      lr_number: lr_number || null,
      vehicle_number: vehicle_number || null,
      remarks: remarks || null,
      status,
      status_updated_at: status !== oldStatus ? new Date().toISOString() : undefined,
    })
    .eq('delivery_id', delivery_id);
  if (updErr) throw updErr;

  const { error: delAllocErr } = await supabase
    .from('purchase_delivery_godowns')
    .delete()
    .eq('delivery_id', delivery_id);
  if (delAllocErr) throw delAllocErr;

  const godownRows = resolveGodownAllocations(godown_allocations, status, transporter_id).map(a => ({
    delivery_id,
    godown_id: a.godown_id,
    qty: Number(a.qty),
  }));
  const { error: gdErr } = await supabase
    .from('purchase_delivery_godowns')
    .insert(godownRows);
  if (gdErr) throw gdErr;

  const back_dated = delivery_date < today;

  if (status === 'Arrived') {
    // The lift was sitting "AT TPT GDN" — that stock-in at the transporter's
    // own godown is now moving to the real destination, so undo it here
    // instead of double-counting it alongside the PURCHASE_IN created below.
    if (oldStatus === 'In Transport Godown' && transporter_id) {
      await voidLiftTransaction(delivery.lifting_number, transporter_id, 'PURCHASE_IN', 'Moved to destination godown on Arrived');
    }

    const txnRows = godown_allocations.map(a => ({
      product_id: item.product_id,
      godown_id: a.godown_id,
      txn_date: delivery_date,
      txn_type: 'PURCHASE_IN',
      qty: Number(a.qty),
      is_void: false,
      created_by: user_id,
      back_dated,
      lr_number: lr_number || null,
      vehicle_number: vehicle_number || null,
      lifting_number: delivery.lifting_number,
    }));
    const { error: txnErr } = await supabase
      .from('transactions')
      .insert(txnRows);
    if (txnErr) throw txnErr;
  } else if (status === 'In Transport Godown' && transporter_id) {
    // Goods have physically reached the transporter's own godown — that's a
    // real stock-in, same as Arrived is for the final destination.
    await ensureLiftPurchaseIn({
      product_id: item.product_id, godown_id: transporter_id, qty: totalQty, txn_date: delivery_date,
      lifting_number: delivery.lifting_number, lr_number, vehicle_number, created_by: user_id, back_dated,
    });
  } else if (oldStatus === 'In Transport Godown' && transporter_id) {
    // Moved back off "AT TPT GDN" (e.g. reverted to In Transit) — undo that stock-in.
    await voidLiftTransaction(delivery.lifting_number, transporter_id, 'PURCHASE_IN', 'Status reverted from AT TPT GDN');
  }

};

export const updateDeliveryStatus = async ({ delivery_id, status, user_id, received_quantity, delivery_date, godown_id }) => {
  const { data: delivery, error: fetchErr } = await supabase
    .from('purchase_deliveries')
    .select(`status, item_id, indent_id, delivery_date, received_quantity, lr_number, vehicle_number, lifting_number, transporter_id`)
    .eq('delivery_id', delivery_id)
    .single();
  if (fetchErr) throw new Error('Delivery not found.');

  const oldStatus = delivery.status;
  const targetQty = received_quantity !== undefined ? Number(received_quantity) : Number(delivery.received_quantity);
  const targetDate = delivery_date !== undefined ? delivery_date : delivery.delivery_date;

  if (status === 'Arrived') {
    const today = getTodayLocal();
    if (targetDate.slice(0, 10) > today) {
      throw new Error('Lifting date cannot be a future date when marking as Arrived.');
    }
  }

  const updateFields = { status, status_updated_at: new Date().toISOString() };
  if (received_quantity !== undefined) {
    updateFields.received_quantity = targetQty;
  }
  if (delivery_date !== undefined) {
    updateFields.delivery_date = targetDate;
  }

  const { error: updErr } = await supabase
    .from('purchase_deliveries')
    .update(updateFields)
    .eq('delivery_id', delivery_id);
  if (updErr) throw updErr;

  if (status === 'Arrived' && godown_id) {
    // Marking Arrived with an explicit destination godown replaces whatever
    // allocation existed before (e.g. the transporter's own godown while in transit).
    const { error: delAllocErr } = await supabase
      .from('purchase_delivery_godowns')
      .delete()
      .eq('delivery_id', delivery_id);
    if (delAllocErr) throw delAllocErr;

    const { error: gdInsErr } = await supabase
      .from('purchase_delivery_godowns')
      .insert([{ delivery_id, godown_id, qty: targetQty }]);
    if (gdInsErr) throw gdInsErr;
  } else if (received_quantity !== undefined) {
    const { data: godownAllocs, error: gdFetchErr } = await supabase
      .from('purchase_delivery_godowns')
      .select('*')
      .eq('delivery_id', delivery_id);
    if (gdFetchErr) throw gdFetchErr;
    if (godownAllocs && godownAllocs.length > 0) {
      const { error: gdUpdErr } = await supabase
        .from('purchase_delivery_godowns')
        .update({ qty: targetQty })
        .eq('delivery_id', delivery_id)
        .eq('godown_id', godownAllocs[0].godown_id);
      if (gdUpdErr) throw gdUpdErr;
    }
  }

  if (status === 'Arrived' && oldStatus !== 'Arrived') {
    // The lift was sitting "AT TPT GDN" — that stock-in at the transporter's
    // own godown is now moving to the real destination, so undo it here
    // instead of double-counting it alongside the PURCHASE_IN created below.
    if (oldStatus === 'In Transport Godown' && delivery.transporter_id) {
      await voidLiftTransaction(delivery.lifting_number, delivery.transporter_id, 'PURCHASE_IN', 'Moved to destination godown on Arrived');
    }

    const { data: item, error: itemErr } = await supabase
      .from('purchase_indent_items')
      .select(`product_id`)
      .eq('item_id', delivery.item_id)
      .single();
    if (itemErr) throw new Error('Item not found.');

    const { data: godownAllocs, error: gdErr } = await supabase
      .from('purchase_delivery_godowns')
      .select('godown_id, qty')
      .eq('delivery_id', delivery_id);
    if (gdErr) throw gdErr;

    const back_dated = targetDate < getTodayLocal();
    const txnRows = (godownAllocs || []).map(a => ({
      product_id: item.product_id,
      godown_id: a.godown_id,
      txn_date: targetDate,
      txn_type: 'PURCHASE_IN',
      qty: Number(a.qty),
      is_void: false,
      created_by: user_id,
      back_dated,
      lr_number: delivery.lr_number || null,
      vehicle_number: delivery.vehicle_number || null,
      lifting_number: delivery.lifting_number,
    }));
    const { error: txnErr } = await supabase
      .from('transactions')
      .insert(txnRows);
    if (txnErr) throw txnErr;
  }

};

export const getDeliveriesForItem = async (itemId) => {
  const { data, error } = await supabase
    .from('purchase_deliveries')
    .select(`
      *,
      transporters:transporter_id(name),
      purchase_delivery_godowns(
        godown_id,
        qty,
        godowns:godown_id(name)
      )
    `)
    .eq('item_id', itemId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const getPurchaseCompleteItems = async () => {
  const { data: items, error: itemsErr } = await supabase
    .from('purchase_indent_items')
    .select(`
      *,
      products:product_id(name, unit),
      item_vendor:vendor_id(name),
      purchase_indents!inner(
        indent_id, indent_date, indent_number, godown_id, vendor_id, is_void, process_type,
        godowns:godown_id(name),
        vendors:vendor_id(name)
      )
    `)
    .eq('purchase_indents.is_void', false)
    .order('created_at', { ascending: false });

  if (itemsErr) throw itemsErr;

  const itemIds = (items || []).map(i => i.item_id);
  let deliverySums = [];
  let allocatedSums = [];
  if (itemIds.length > 0) {
    const [sumsRes, allocRes] = await Promise.all([
      supabase
        .from('purchase_deliveries')
        .select('item_id, received_quantity')
        .eq('status', 'Arrived')
        .in('item_id', itemIds),
      supabase
        .from('purchase_deliveries')
        .select('item_id, received_quantity')
        .in('item_id', itemIds)
    ]);
    if (sumsRes.error) throw sumsRes.error;
    if (allocRes.error) throw allocRes.error;
    deliverySums = sumsRes.data || [];
    allocatedSums = allocRes.data || [];
  }

  const sumMap = {};
  deliverySums.forEach(d => {
    sumMap[d.item_id] = (sumMap[d.item_id] || 0) + Number(d.received_quantity);
  });

  const allocatedMap = {};
  allocatedSums.forEach(d => {
    allocatedMap[d.item_id] = (allocatedMap[d.item_id] || 0) + Number(d.received_quantity);
  });

  return (items || [])
    .map(item => {
      const received_qty = sumMap[item.item_id] || 0;
      const allocated_qty = allocatedMap[item.item_id] || 0;
      const remaining_qty = Number(item.quantity) - received_qty;
      const remaining_alloc_qty = Math.max(0, Number(item.quantity) - allocated_qty);
      let delivery_status = 'Pending';
      if (received_qty >= Number(item.quantity)) delivery_status = 'Completed';
      else if (received_qty > 0) delivery_status = 'Partial';

      return {
        ...item,
        received_qty,
        allocated_qty,
        remaining_qty: Math.max(0, remaining_qty),
        remaining_alloc_qty,
        delivery_status,
      };
    })
    .filter(item => item.received_qty > 0 || item.delivery_status === 'Completed');
};

export const getPackagingSize = (product) => {
  if (!product) return 30;
  if (product.packaging_size && !isNaN(Number(product.packaging_size))) {
    return Number(product.packaging_size);
  }
  if (product.mux) {
    const match = String(product.mux).match(/(\d+(\.\d+)?)/);
    if (match) return parseFloat(match[1]);
  }
  if (product.name) {
    const match = String(product.name).match(/\((\d+(\.\d+)?)\s*Kg\)/i);
    if (match) return parseFloat(match[1]);
  }
  return 30;
};

export const getAawakDeliveries = async (statusFilter = null) => {
  let query = supabase
    .from('purchase_deliveries')
    .select(`
      *,
      transporters:transporter_id(transporter_id, name, vehicle_number, driver_phone_number),
      purchase_indent_items(
        item_id,
        quantity,
        rate,
        products:product_id(name, unit, mux),
        item_vendor:vendor_id(name),
        purchase_indents(
          indent_id, indent_number, indent_date, vendor_id, godown_id,
          vendors:vendor_id(name),
          godowns:godown_id(name)
        )
      ),
      purchase_delivery_godowns(
        godown_id,
        qty,
        godowns:godown_id(name)
      )
    `)
    .order('created_at', { ascending: false });

  if (statusFilter) {
    if (Array.isArray(statusFilter)) {
      query = query.in('status', statusFilter);
    } else {
      query = query.eq('status', statusFilter);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

// Item-centric view for the Purchase Dashboard: every non-void indent line item,
// with its approval info and its lifts rolled up into "still moving" (In Transit /
// AT TPT GDN) vs "received" (Arrived / Received) quantities and godowns.
export const getPurchaseDashboardItems = async () => {
  const { data: items, error } = await supabase
    .from('purchase_indent_items')
    .select(`
      *,
      products:product_id(name, unit),
      item_vendor:vendor_id(name),
      purchase_indents!inner(
        indent_id, indent_date, indent_number, process_type, vendor_id, is_void,
        vendors:vendor_id(name)
      ),
      purchase_deliveries(
        delivery_id, lifting_number, delivery_date, status, received_quantity,
        transporter_id, lr_number, vehicle_number, driver_phone_number,
        transporters:transporter_id(name, vehicle_number, driver_phone_number),
        purchase_delivery_godowns(godown_id, qty, godowns:godown_id(name))
      )
    `)
    .eq('purchase_indents.is_void', false)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Resolved separately (rather than embedded via `approved_by(full_name)`) so
  // this keeps working even before the approved_by foreign key is registered
  // in PostgREST's schema cache — it only needs the plain column to exist.
  const approverIds = Array.from(new Set((items || []).map(i => i.approved_by).filter(Boolean)));
  let approverMap = {};
  if (approverIds.length > 0) {
    const { data: approvers } = await supabase
      .from('users')
      .select('user_id, full_name')
      .in('user_id', approverIds);
    approverMap = Object.fromEntries((approvers || []).map(u => [u.user_id, u.full_name]));
  }

  return (items || []).map(item => {
    const indent = item.purchase_indents || {};
    const deliveries = item.purchase_deliveries || [];
    const receivedGodowns = new Set();
    let intransitQty = 0;
    let receivedQty = 0;

    const lifts = deliveries.map(del => {
      const qty = Number(del.received_quantity || 0);
      const isReceived = del.status === 'Arrived' || del.status === 'Received';
      if (isReceived) receivedQty += qty;
      else intransitQty += qty;

      const godownName = del.purchase_delivery_godowns?.[0]?.godowns?.name || '—';
      if (isReceived && godownName !== '—') receivedGodowns.add(godownName);

      return {
        delivery_id: del.delivery_id,
        lifting_number: del.lifting_number,
        delivery_date: del.delivery_date,
        status: del.status,
        transporter_name: del.transporters?.name || '—',
        lr_number: del.lr_number,
        vehicle_number: del.vehicle_number || del.transporters?.vehicle_number,
        driver_phone_number: del.driver_phone_number || del.transporters?.driver_phone_number,
        received_quantity: qty,
        godown_name: godownName,
      };
    });

    const quantity = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);

    return {
      item_id: item.item_id,
      indent_date: indent.indent_date,
      indent_number: indent.indent_number,
      indent_type: indent.process_type === 'direct' ? 'Direct' : 'Process',
      product_name: item.products?.name || '—',
      unit: item.products?.unit || '—',
      vendor_name: item.item_vendor?.name || indent.vendors?.name || '—',
      total_qty: quantity,
      rate,
      total_amount: quantity * rate,
      approval_status: item.approval_status || 'Pending',
      approve_qty: item.approval_status === 'Approved' ? quantity : null,
      approved_by_name: approverMap[item.approved_by] || null,
      intransit_qty: intransitQty,
      received_qty: receivedQty,
      received_godown_str: Array.from(receivedGodowns).join(', ') || '—',
      lifts,
    };
  });
};

export const updateAawakLift = async ({ delivery_id, godown_id, lr_number, driver_phone_number, vehicle_number, remarks, status, received_quantity, user_id, transporter_id }) => {
  const { data: existing, error: fetchErr } = await supabase
    .from('purchase_deliveries')
    .select('status, item_id, delivery_date, lifting_number, lr_number, vehicle_number, received_quantity')
    .eq('delivery_id', delivery_id)
    .single();
  if (fetchErr) throw new Error('Delivery not found.');
  const oldStatus = existing.status;

  if (status === 'Arrived' || status === 'Received') {
    // Marking Arrived hands off to the real, manually-selected destination
    // godown — this replaces whatever allocation existed while in transit
    // (e.g. the transporter's own godown) and is when stock actually moves in.
    return updateDeliveryStatus({
      delivery_id,
      status: 'Arrived',
      user_id,
      received_quantity,
      godown_id,
    });
  }

  const updatePayload = {};
  if (lr_number !== undefined) updatePayload.lr_number = lr_number;
  if (driver_phone_number !== undefined) updatePayload.driver_phone_number = driver_phone_number;
  if (vehicle_number !== undefined) updatePayload.vehicle_number = vehicle_number;
  if (remarks !== undefined) updatePayload.remarks = remarks;
  if (status !== undefined) updatePayload.status = status;

  const { data, error } = await supabase
    .from('purchase_deliveries')
    .update(updatePayload)
    .eq('delivery_id', delivery_id)
    .select()
    .single();

  if (error) throw error;

  // While sitting "AT TPT GDN" (In Transport Godown), stock is tracked against
  // the transporter's own linked godown rather than whatever real godown was
  // picked — that real godown only takes effect once marked Arrived above.
  const newStatus = status !== undefined ? status : oldStatus;
  const effectiveGodownId = newStatus === 'In Transport Godown' && transporter_id ? transporter_id : godown_id;

  if (effectiveGodownId) {
    await supabase
      .from('purchase_delivery_godowns')
      .delete()
      .eq('delivery_id', delivery_id);

    await supabase
      .from('purchase_delivery_godowns')
      .insert([{ delivery_id, godown_id: effectiveGodownId, qty: data.received_quantity || 0 }]);
  }

  // Keep the real stock ledger in sync: "AT TPT GDN" is a genuine stock-in at
  // the transporter's own godown, exactly like Arrived is for the final
  // destination — not just a display allocation.
  if (newStatus === 'In Transport Godown' && transporter_id) {
    const { data: item, error: itemErr } = await supabase
      .from('purchase_indent_items')
      .select('product_id')
      .eq('item_id', existing.item_id)
      .single();
    if (itemErr) throw new Error('Item not found.');

    const qty = data.received_quantity ?? existing.received_quantity ?? 0;
    const back_dated = (data.delivery_date || existing.delivery_date) < getTodayLocal();
    await ensureLiftPurchaseIn({
      product_id: item.product_id,
      godown_id: transporter_id,
      qty,
      txn_date: data.delivery_date || existing.delivery_date,
      lifting_number: existing.lifting_number,
      lr_number: data.lr_number ?? existing.lr_number,
      vehicle_number: data.vehicle_number ?? existing.vehicle_number,
      created_by: user_id,
      back_dated,
    });
  } else if (oldStatus === 'In Transport Godown' && newStatus !== 'In Transport Godown' && transporter_id) {
    // Moved back off "AT TPT GDN" (e.g. reverted to In Transit) — undo that stock-in.
    await voidLiftTransaction(existing.lifting_number, transporter_id, 'PURCHASE_IN', 'Status reverted from AT TPT GDN');
  }

  return data;
};

export const cancelIndentItem = async (item_id) => {
  const { error } = await supabase
    .from('purchase_indent_items')
    .update({ planning_status: 'Cancelled' })
    .eq('item_id', item_id);
  if (error) throw error;
};

export const getVendorDashboardData = async (signal) => {
  const { data, error } = await supabase
    .from('purchase_indents')
    .select(`
      indent_id,
      indent_number,
      indent_date,
      remarks,
      created_by,
      is_void,
      users:created_by(full_name),
      vendors:vendor_id(name),
      purchase_indent_items(
        item_id,
        quantity,
        rate,
        vendor_remarks,
        planning_status,
        approval_status,
        products:product_id(name, unit),
        item_vendor:vendor_id(name),
        purchase_deliveries(
          delivery_id,
          received_quantity,
          status,
          expected_delivery_date,
          remarks
        )
      )
    `)
    .eq('is_void', false)
    .order('created_at', { ascending: false })
    .abortSignal(signal);

  if (error) throw error;

  const rows = [];
  for (const indent of data || []) {
    const indentNo = indent.indent_number || '—';
    const approvedBy = indent.users?.full_name || 'Admin';
    const indentRemarks = indent.remarks || '';

    for (const item of indent.purchase_indent_items || []) {
      const vendorName =
        item.item_vendor?.name ||
        indent.vendors?.name ||
        'Unassigned Vendor';
      const productName = item.products?.name || 'Unassigned Product';
      const unit = item.products?.unit || 'Kg';
      const totalQty = Number(item.quantity || 0);

      const deliveries = item.purchase_deliveries || [];
      const liftQty = deliveries.reduce((sum, d) => sum + Number(d.received_quantity || 0), 0);
      const deliveryQty = deliveries
        .filter(d => d.status === 'Arrived' || d.status === 'Received')
        .reduce((sum, d) => sum + Number(d.received_quantity || 0), 0);
      const pendingQty = Math.max(0, totalQty - deliveryQty);

      const pendingDeliveries = deliveries.filter(d => d.status !== 'Arrived' && d.status !== 'Received');
      const expectedDate =
        pendingDeliveries.map(d => d.expected_delivery_date).filter(Boolean).sort()[0] ||
        deliveries.map(d => d.expected_delivery_date).filter(Boolean).sort()[0] ||
        '—';

      const remark = item.vendor_remarks || indentRemarks || deliveries.map(d => d.remarks).filter(Boolean).join(', ') || '—';

      rows.push({
        id: item.item_id,
        indentId: indent.indent_id,
        indentNo,
        vendorName,
        productName,
        unit,
        totalQty,
        approvedBy,
        pendingQty,
        liftQty,
        deliveryQty,
        expectedDate,
        remark,
        approvalStatus: item.approval_status || 'Pending',
      });
    }
  }

  return rows;
};
