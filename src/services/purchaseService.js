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
  return indents || [];
};

export const createIndent = async ({ indent_date, indent_number, godown_id, vendor_id, remarks, items, created_by }) => {
  const total = items.reduce((sum, item) => sum + (Number(item.rate) || 0) * (Number(item.quantity) || 0), 0);

  const { data: indent, error: indentErr } = await supabase
    .from('purchase_indents')
    .insert([{ indent_date, indent_number, godown_id, vendor_id, remarks, total_amount: total, created_by }])
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
        indent_id, indent_date, indent_number, godown_id, vendor_id, remarks,
        godowns:godown_id(name),
        vendors:vendor_id(name)
      )
    `)
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
        indent_id, indent_date, indent_number, godown_id, vendor_id, is_void,
        godowns:godown_id(name),
        vendors:vendor_id(name)
      )
    `)
    .eq('approval_status', 'Approved')
    .order('created_at', { ascending: false });

  if (itemsErr) throw itemsErr;

  const itemIds = (items || []).map(i => i.item_id);
  let deliverySums = [];
  if (itemIds.length > 0) {
    const { data: sums, error: sumsErr } = await supabase
      .from('purchase_deliveries')
      .select('item_id, received_quantity')
      .in('item_id', itemIds);
    if (sumsErr) throw sumsErr;
    deliverySums = sums || [];
  }

  const sumMap = {};
  deliverySums.forEach(d => {
    sumMap[d.item_id] = (sumMap[d.item_id] || 0) + Number(d.received_quantity);
  });

  return (items || [])
    .filter(item => !item.purchase_indents?.is_void)
    .map(item => {
      const received_qty = sumMap[item.item_id] || 0;
      const remaining_qty = Number(item.quantity) - received_qty;
      let delivery_status = 'Pending';
      if (received_qty >= Number(item.quantity)) delivery_status = 'Completed';
      else if (received_qty > 0) delivery_status = 'Partial';

      return {
        ...item,
        received_qty,
        remaining_qty: Math.max(0, remaining_qty),
        delivery_status,
      };
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

export const createDelivery = async ({ item_id, indent_id, delivery_date, godown_allocations, transporter_id, lr_number, vehicle_number, remarks, created_by }) => {
  const { data: item, error: itemErr } = await supabase
    .from('purchase_indent_items')
    .select(`product_id`)
    .eq('item_id', item_id)
    .single();
  if (itemErr) throw new Error('Item not found.');

  const product_id = item.product_id;
  const back_dated = delivery_date < getTodayLocal();
  const lifting_number = await generateNextLiftingNumber();
  const totalQty = godown_allocations.reduce((s, a) => s + Number(a.qty), 0);

  const { data: delivery, error: delErr } = await supabase
    .from('purchase_deliveries')
    .insert([{
      item_id, indent_id, delivery_date,
      received_quantity: totalQty,
      transporter_id: transporter_id || null,
      lr_number: lr_number || null,
      vehicle_number: vehicle_number || null,
      lifting_number,
      status: 'Received',
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

  return { ...delivery, lifting_number };
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
    .order('delivery_date', { ascending: false });

  if (error) throw error;
  return data || [];
};
