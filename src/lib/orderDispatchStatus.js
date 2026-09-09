// An order counts as "fully dispatched" once every one of its items has
// nothing left pending in Dispatch Planning — i.e. each item's own
// (ordered qty − cancelled qty − qty already planned) is zero or less. Same
// per-item math OrderTable's expanded row already uses for its Remaining
// badge, just rolled up to the whole order — and the same "remaining > 0"
// rule Dispatch Planning's own Pending list uses, so an order shows here
// exactly when its order number would still show there.
export const isOrderFullyDispatched = (order) => {
  const items = order?.sales_order_items || [];
  // An order with no items isn't something we can call "done" — surface it
  // rather than silently hiding what's likely a data problem.
  if (items.length === 0) return false;

  return items.every(item => {
    const plansArr = Array.isArray(item.dispatch_plans) ? item.dispatch_plans : [];
    const activePlans = plansArr.filter(p => p.dispatch_status !== 'Cancelled');
    const cancelledQty = Number(item.cancelled_quantity || 0);
    const effectiveQty = Number(item.quantity) - cancelledQty;
    const plannedQty = activePlans.reduce((sum, p) => sum + Number(p.quantity), 0);
    const remaining = effectiveQty - plannedQty;
    return remaining <= 0;
  });
};
