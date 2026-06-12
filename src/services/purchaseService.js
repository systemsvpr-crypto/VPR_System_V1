import { supabase } from '../supabase';

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
