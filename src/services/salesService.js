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

export const createOrder = async ({ order_date, order_number, customer_id, items, created_by, process_type }) => {
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

  return order;
};

export const updateOrder = async (order_id, { order_date, order_number, customer_id, items, process_type }) => {
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
        order_number, order_date, process_type,
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

export const getSkipDeliveredItems = async () => {
  const { data: items, error: itemsErr } = await supabase
    .from('sales_order_items')
    .select(`
      *,
      sales_orders!inner(
        order_number, order_date, process_type, created_by,
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

  const planMap = {};
  (plans || []).forEach(p => { planMap[p.order_item_id] = p; });

  const userIds = new Set(items.filter(i => i.sales_orders?.created_by).map(i => i.sales_orders.created_by));
  const { data: users } = userIds.size > 0
    ? await supabase.from('users').select('user_id, full_name').in('user_id', [...userIds])
    : { data: [] };
  const userMap = {};
  (users || []).forEach(u => { userMap[u.user_id] = u.full_name; });

  return items.map(item => ({
    ...item,
    dispatch_plans: planMap[item.item_id] ? [planMap[item.item_id]] : [],
    person_name: userMap[item.sales_orders?.created_by] || '—',
  }));
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
        products:product_id(name, unit),
        sales_orders!inner(
          order_number, process_type,
          customers:customer_id(name)
        )
      ),
      godowns:godown_id(name),
      users:created_by(full_name)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
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

export const saveDispatchPlan = async ({ order_item_id, quantity, godown_id, unit_price, dispatch_date, created_by, dispatch_status }) => {
  const { data: existing } = await supabase
    .from('dispatch_plans')
    .select('dispatch_number, dispatch_status, created_by')
    .eq('order_item_id', order_item_id)
    .maybeSingle();

  let dispatch_number = existing?.dispatch_number;
  if (!dispatch_number) {
    dispatch_number = await generateNextDispatchNumber();
  }

  const payload = {
    order_item_id,
    quantity: Number(quantity),
    godown_id,
    unit_price: Number(unit_price),
    dispatch_date,
    dispatch_number,
    is_planned: true,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    payload.dispatch_status = dispatch_status || existing.dispatch_status || 'Pending';
    payload.created_by = existing.created_by || created_by;
  } else {
    payload.created_by = created_by;
    payload.dispatch_status = dispatch_status || 'Pending';
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('dispatch_plans')
      .upsert(payload, { onConflict: 'order_item_id' })
      .select()
      .single();

    if (!error) return data;

    if (error.code === PG_UNIQUE_VIOLATION && !existing?.dispatch_number) {
      dispatch_number = await generateNextDispatchNumber();
      payload.dispatch_number = dispatch_number;
      continue;
    }

    throw error;
  }

  throw new Error('Failed to save dispatch plan after multiple attempts');
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
  if (!planIds || planIds.length === 0) return [];
  const { data, error } = await supabase
    .from('dispatch_plans')
    .update({ inform_after_dispatch, updated_at: new Date().toISOString() })
    .in('plan_id', planIds)
    .select();
  if (error) throw error;
  return data;
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

export const updateOrderItemProduct = async (item_id, product_id) => {
  const { error } = await supabase
    .from('sales_order_items')
    .update({ product_id })
    .eq('item_id', item_id);
  if (error) throw error;
};

export const voidOrder = async (order_id) => {
  const { error } = await supabase
    .from('sales_orders')
    .update({ is_void: true })
    .eq('order_id', order_id);
  if (error) throw error;
};
