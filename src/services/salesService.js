import { supabase } from '../supabase';
import { voidTransaction as stockVoidTransaction } from './stockService';

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
  (plans || []).forEach(p => {
    if (!planMap[p.order_item_id]) planMap[p.order_item_id] = [];
    planMap[p.order_item_id].push(p);
  });

  return orders.map(o => ({
    ...o,
    sales_order_items: (o.sales_order_items || []).map(i => ({
      ...i,
      dispatch_plans: planMap[i.item_id] || [],
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

export const saveDispatchPlan = async ({ plan_id, order_item_id, quantity, godown_id, unit_price, dispatch_date, created_by, dispatch_status }) => {
  const payload = {
    order_item_id,
    quantity: Number(quantity),
    godown_id,
    unit_price: Number(unit_price),
    dispatch_date,
    is_planned: true,
    updated_at: new Date().toISOString(),
    dispatch_status: dispatch_status || 'Pending',
    created_by,
  };

  if (plan_id) {
    const { data: existing } = await supabase
      .from('dispatch_plans')
      .select('dispatch_number')
      .eq('plan_id', plan_id)
      .single();
    payload.dispatch_number = existing?.dispatch_number;
    if (existing) payload.created_by = created_by;

    const { data, error } = await supabase
      .from('dispatch_plans')
      .update(payload)
      .eq('plan_id', plan_id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  payload.dispatch_number = await generateNextDispatchNumber();

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('dispatch_plans')
      .insert([payload])
      .select()
      .single();

    if (!error) return data;

    if (error.code === PG_UNIQUE_VIOLATION) {
      payload.dispatch_number = await generateNextDispatchNumber();
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

export const completeDispatchWithStockOut = async ({ plan_id, product_id, godown_id, quantity, dispatch_date, dispatch_number, created_by }) => {
  const getTodayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const todayLocal = getTodayLocal();
  if (dispatch_date > todayLocal) {
    throw new Error('Dispatch date cannot be in the future.');
  }

  const { data: product } = await supabase
    .from('products')
    .select('product_id, allow_negative_stock')
    .eq('product_id', product_id)
    .single();

  const { data: stockRow } = await supabase
    .from('godown_stock')
    .select('current_stock')
    .eq('product_id', product_id)
    .eq('godown_id', godown_id)
    .maybeSingle();

  const available = stockRow?.current_stock ?? 0;
  if (available < Number(quantity) && !product.allow_negative_stock) {
    throw new Error(`Insufficient stock at selected godown. Available: ${available}, Required: ${quantity}.`);
  }

  const back_dated = new Date(dispatch_date) < new Date(new Date().toDateString());

  const { data: txn, error: txnErr } = await supabase
    .from('transactions')
    .insert([{
      product_id,
      godown_id,
      txn_date: dispatch_date,
      txn_type: 'OUT_GODOWN',
      qty: Number(quantity),
      is_void: false,
      created_by,
      back_dated,
      dispatch_plan_id: plan_id,
      dispatch_number,
    }])
    .select()
    .single();
  if (txnErr) throw txnErr;

  const { data: planRow } = await supabase
    .from('dispatch_plans')
    .select('quantity')
    .eq('plan_id', plan_id)
    .single();

  const { data: dispatchTxns } = await supabase
    .from('transactions')
    .select('qty')
    .eq('dispatch_plan_id', plan_id)
    .eq('is_void', false);
  const totalDispatched = (dispatchTxns || []).reduce((s, t) => s + Number(t.qty), 0);
  const newStatus = totalDispatched >= Number(planRow?.quantity || 0)
    ? 'Dispatch Done'
    : 'Partially Dispatched';
  const updateFields = {
    dispatch_status: newStatus,
    updated_at: new Date().toISOString(),
  };
  if (totalDispatched > Number(planRow?.quantity || 0)) {
    updateFields.quantity = totalDispatched;
  }

  const { error: planErr } = await supabase
    .from('dispatch_plans')
    .update(updateFields)
    .eq('plan_id', plan_id);
  if (planErr) throw planErr;

  return { transaction: txn, plan_id };
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
