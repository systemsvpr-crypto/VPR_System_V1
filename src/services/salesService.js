import { supabase } from '../supabase';

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

export const getAllOrders = async () => {
  const { data: orders, error: ordersErr } = await supabase
    .from('sales_orders')
    .select('*, customers:customer_id(name), sales_order_items(*, products:product_id(name, unit), godowns:godown_id(name))')
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

  const planMap = {};
  (plans || []).forEach(p => { planMap[p.order_item_id] = p; });

  return orders.map(o => ({
    ...o,
    sales_order_items: (o.sales_order_items || []).map(i => ({
      ...i,
      dispatch_plans: planMap[i.item_id] ? [planMap[i.item_id]] : [],
    })),
  }));
};

export const createOrder = async ({ order_date, order_number, customer_id, items, created_by }) => {
  const total = items.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0);

  const { data: order, error: orderErr } = await supabase
    .from('sales_orders')
    .insert([{ order_date, order_number, customer_id, total_amount: total, created_by }])
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

  return order;
};

export const updateOrder = async (order_id, { order_date, order_number, customer_id, items }) => {
  const total = items.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.quantity) || 0), 0);

  const { error: orderErr } = await supabase
    .from('sales_orders')
    .update({ order_date, order_number, customer_id, total_amount: total })
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
};

export const getAllOrderItemsForDispatch = async () => {
  const { data: items, error: itemsErr } = await supabase
    .from('sales_order_items')
    .select(`
      *,
      sales_orders!inner(
        order_number, order_date,
        customers:customer_id(name)
      ),
      products:product_id(name, unit)
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

  const planMap = {};
  (plans || []).forEach(p => { planMap[p.order_item_id] = p; });

  return items.map(item => ({
    ...item,
    dispatch_plans: planMap[item.item_id] ? [planMap[item.item_id]] : [],
  }));
};

export const saveDispatchPlan = async ({ order_item_id, quantity, godown_id, unit_price, dispatch_date }) => {
  const { data, error } = await supabase
    .from('dispatch_plans')
    .upsert({
      order_item_id,
      quantity: Number(quantity),
      godown_id,
      unit_price: Number(unit_price),
      dispatch_date,
      is_planned: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'order_item_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const voidOrder = async (order_id) => {
  const { error } = await supabase
    .from('sales_orders')
    .update({ is_void: true })
    .eq('order_id', order_id);
  if (error) throw error;
};
