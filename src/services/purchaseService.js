import { supabase } from '../supabase';

const getTodayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

  if (items.length > 0) {
    const itemRows = items.map(item => ({
      indent_id: indent.indent_id,
      product_id: item.product_id,
      quantity: Number(item.quantity),
      rate: Number(item.rate),
    }));
    const { error: itemErr } = await supabase
      .from('purchase_indent_items')
      .insert(itemRows);
    if (itemErr) throw itemErr;
  }

  return indent;
};

export const updateIndent = async (indent_id, { indent_date, indent_number, godown_id, vendor_id, remarks, items }) => {
  const total = items.reduce((sum, item) => sum + (Number(item.rate) || 0) * (Number(item.quantity) || 0), 0);

  const { error: indentErr } = await supabase
    .from('purchase_indents')
    .update({ indent_date, indent_number, godown_id, vendor_id, remarks, total_amount: total })
    .eq('indent_id', indent_id);
  if (indentErr) throw indentErr;

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
};

export const voidIndent = async (indent_id) => {
  const { error } = await supabase
    .from('purchase_indents')
    .update({ is_void: true })
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

export const updateVendorSelection = async (item_id, { vendor_id, rate, planning_date, vendor_remarks, planning_status }) => {
  const updateFields = {};
  if (vendor_id !== undefined) updateFields.vendor_id = vendor_id;
  if (rate !== undefined) updateFields.rate = Number(rate);
  if (planning_date !== undefined) updateFields.planning_date = planning_date;
  if (vendor_remarks !== undefined) updateFields.vendor_remarks = vendor_remarks;
  if (planning_status !== undefined) updateFields.planning_status = planning_status;

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

export const approveIndentItem = async (item_id, { vendor_id, rate, quantity, godown_id }) => {
  const updateFields = { approval_status: 'Approved' };
  if (vendor_id !== undefined) updateFields.vendor_id = vendor_id;
  if (rate !== undefined) updateFields.rate = Number(rate);
  if (quantity !== undefined) updateFields.quantity = Number(quantity);
  if (godown_id !== undefined) updateFields.approved_godown_id = godown_id;

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
    .eq('purchase_indents.process_type', 'process')
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
    .filter(item => !item.purchase_indents?.is_void)
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
    });
};

export const getDirectItemsForAawak = async () => {
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
    .eq('purchase_indents.process_type', 'direct')
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
    .filter(item => item.remaining_qty > 0);
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

export const createDelivery = async ({ item_id, indent_id, delivery_date, expected_delivery_date, godown_allocations, transporter_id, lr_number, vehicle_number, remarks, created_by, status }) => {
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
      lifting_number,
      status: deliveryStatus,
      remarks: remarks || null,
      created_by,
    }])
    .select()
    .single();
  if (delErr) throw delErr;

  const godownRows = godown_allocations.map(a => ({
    delivery_id: delivery.delivery_id,
    godown_id: a.godown_id,
    qty: Number(a.qty),
  }));
  const { error: gdErr } = await supabase
    .from('purchase_delivery_godowns')
    .insert(godownRows);
  if (gdErr) throw gdErr;

  if (deliveryStatus === 'Arrived') {
    const back_dated = delivery_date < getTodayLocal();
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
  }

  return { ...delivery, lifting_number };
};

export const updateDelivery = async ({ delivery_id, delivery_date, expected_delivery_date, godown_allocations, transporter_id, lr_number, vehicle_number, remarks, status, user_id }) => {
  const { data: delivery, error: fetchErr } = await supabase
    .from('purchase_deliveries')
    .select(`status, item_id, lifting_number`)
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

  const godownRows = godown_allocations.map(a => ({
    delivery_id,
    godown_id: a.godown_id,
    qty: Number(a.qty),
  }));
  const { error: gdErr } = await supabase
    .from('purchase_delivery_godowns')
    .insert(godownRows);
  if (gdErr) throw gdErr;

  if (status === 'Arrived') {
    const back_dated = delivery_date < today;
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
  }
};

export const updateDeliveryStatus = async ({ delivery_id, status, user_id, received_quantity, delivery_date }) => {
  const { data: delivery, error: fetchErr } = await supabase
    .from('purchase_deliveries')
    .select(`status, item_id, delivery_date, received_quantity, lr_number, vehicle_number, lifting_number`)
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

  if (received_quantity !== undefined) {
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
