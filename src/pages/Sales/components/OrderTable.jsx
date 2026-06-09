import { useState } from 'react';
import { ShoppingCart, Edit2, ChevronDown, Lock, Ban } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

const OrderTable = ({ orders, totalItems, loading, onEdit, onCancel, searchTerm }) => {
  const [expandedOrders, setExpandedOrders] = useState(new Set());

  const toggleExpand = (orderId) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading orders...</p>
      </div>
    );
  }

  if (totalItems === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <ShoppingCart size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Orders Found</h3>
        <p className="text-sm text-slate-400">
          {searchTerm ? 'No orders match your search criteria.' : 'Click "Add Order" above to create your first order.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
          <tr>
            <th className="w-10" />
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Date</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order No.</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[110px]">Type</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Items</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Amount</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
            <th className="w-16 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.flatMap(o => {
            const isExpanded = expandedOrders.has(o.order_id);
            const items = o.sales_order_items || [];
            const rows = [
              <tr key={o.order_id} className="hover:bg-slate-50 transition-colors group cursor-pointer"
                onClick={() => toggleExpand(o.order_id)}>
                <td className="px-2 py-3">
                  {items.length > 0 && (
                    <ChevronDown size={16}
                      className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{format(new Date(o.order_date), 'dd/MM/yyyy')}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{o.order_number}</td>
                <td className="px-4 py-3 text-slate-600">{o.customers?.name || '—'}</td>
                <td className="px-4 py-3 text-center">
                  {o.process_type === 'skip_delivered' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                      Skip
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                      Process
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                    {items.length}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-800">
                  ₹{Number(o.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs">{format(new Date(o.created_at), 'dd/MM/yyyy')}</td>
                <td className="px-4 py-3 text-center flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(o)}
                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded transition-all">
                    <Edit2 size={15} />
                  </Button>
                  <Button variant="ghost" size="icon" type="button" onClick={() => onCancel(o)}
                    className="p-1.5 text-red-300 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                    title="Cancel items">
                    <Ban size={15} />
                  </Button>
                </td>
              </tr>
            ];
            if (isExpanded && items.length > 0) {
              rows.push(
                <tr key={`${o.order_id}-details`}>
                  <td colSpan={9} className="px-0 py-0">
                    <div className="bg-slate-50 border-t border-slate-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Product</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Godown</th>
                            <th className="text-center px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Ordered</th>
                            <th className="text-center px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Planned</th>
                            <th className="text-center px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dispatched</th>
                            <th className="text-center px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Remaining</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Progress</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.map(item => {
                            const plansArr     = Array.isArray(item.dispatch_plans) ? item.dispatch_plans : [];
                            const activePlans  = plansArr.filter(p => p.dispatch_status !== 'Cancelled');
                            const cancelledQty = Number(item.cancelled_quantity || 0);
                            const effectiveQty = Number(item.quantity) - cancelledQty;
                            const plannedQty   = activePlans.reduce((sum, p) => sum + Number(p.quantity), 0);
                            const dispatchedQty = activePlans.reduce((sum, p) => sum + Number(p.already_dispatched || 0), 0);
                            const remaining    = effectiveQty - plannedQty;
                            const itemLocked   = activePlans.some(p => p.dispatch_status === 'Dispatch Done');
                            const plannedPct   = effectiveQty > 0 ? Math.min((plannedQty / effectiveQty) * 100, 100) : 0;
                            const dispPct      = effectiveQty > 0 ? Math.min((dispatchedQty / effectiveQty) * 100, 100) : 0;
                            return (
                              <tr key={item.item_id} className={`hover:bg-white transition-colors ${itemLocked ? 'opacity-70' : ''}`}>
                                <td className="px-4 py-2.5">
                                  <span className="text-slate-700 font-medium">{item.products?.name || '—'}</span>
                                  <span className="text-xs text-slate-400 ml-1 uppercase">({item.products?.unit})</span>
                                  {itemLocked && <Lock size={12} className="inline ml-1 text-slate-300" />}
                                  {cancelledQty > 0 && (
                                    <span className="ml-1.5 text-[10px] text-red-400 bg-red-50 border border-red-100 px-1 py-0.5 rounded-full">
                                      {cancelledQty} cancelled
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-slate-600 text-xs">{item.godowns?.name || '—'}</td>
                                {/* Ordered */}
                                <td className="px-4 py-2.5 text-center">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                                    {effectiveQty}
                                  </span>
                                </td>
                                {/* Planned */}
                                <td className="px-4 py-2.5 text-center">
                                  <span className={`inline-flex flex-col items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    plannedQty > 0
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                                  }`}>
                                    {plannedQty}
                                    {activePlans.length > 1 && (
                                      <span className="text-[9px] opacity-70 font-normal leading-none">{activePlans.length} plans</span>
                                    )}
                                  </span>
                                </td>
                                {/* Dispatched */}
                                <td className="px-4 py-2.5 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    dispatchedQty > 0
                                      ? 'bg-violet-50 text-violet-700 border border-violet-100'
                                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                                  }`}>
                                    {dispatchedQty}
                                  </span>
                                </td>
                                {/* Remaining */}
                                <td className="px-4 py-2.5 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    remaining > 0
                                      ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                      : remaining === 0
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                                  }`}>
                                    {remaining}
                                  </span>
                                </td>
                                {/* Progress bar */}
                                <td className="px-4 py-2.5 min-w-[100px]">
                                  <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                    <div
                                      className="h-full bg-violet-400 float-left rounded-l-full"
                                      style={{ width: `${dispPct}%` }}
                                    />
                                    <div
                                      className="h-full bg-emerald-300 float-left"
                                      style={{ width: `${Math.max(plannedPct - dispPct, 0)}%` }}
                                    />
                                  </div>
                                  <p className="text-[9px] text-slate-400 mt-0.5 text-right">
                                    {Math.round(plannedPct)}% planned
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              );
            }
            return rows;
          })}
        </tbody>
      </table>
    </div>
  );
};

export default OrderTable;
