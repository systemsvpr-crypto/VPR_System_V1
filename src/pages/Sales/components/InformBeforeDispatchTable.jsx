import { useState, useEffect, useMemo } from 'react';
import { Bell, Square, CheckSquare, Send } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { batchUpdateInformBeforeDispatch } from '../../../services/salesService';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 10;

const InformBeforeDispatchTable = ({ orders, godowns, searchTerm, loading, informFilter, onSave }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [checkedRows, setCheckedRows] = useState(() => new Set());
  const [isNotifying, setIsNotifying] = useState(false);

  const plannedItems = useMemo(() => {
    const result = [];
    (orders || []).forEach(order => {
      if (order.process_type === 'skip_delivered') return;
      (order.sales_order_items || []).forEach(item => {
        (item.dispatch_plans || []).forEach(plan => {
          if (plan.dispatch_status === 'Cancelled') return;
          result.push({ order, item, plan });
        });
      });
    });
    return result;
  }, [orders]);

  const godownMap = useMemo(() => {
    const map = {};
    (godowns || []).forEach(g => { map[g.godown_id] = g.name; });
    return map;
  }, [godowns]);

  const filteredItems = useMemo(() => {
    let result = plannedItems;
    const term = searchTerm?.toLowerCase();
    if (term) {
      result = result.filter(({ order, item }) =>
        order.order_number?.toLowerCase().includes(term) ||
        order.customers?.name?.toLowerCase().includes(term) ||
        item.products?.name?.toLowerCase().includes(term)
      );
    }
    if (informFilter === 'informed') {
      result = result.filter(({ plan }) => plan.inform_before_dispatch === 'Informed');
    } else if (informFilter === 'pending') {
      result = result.filter(({ plan }) => plan.inform_before_dispatch !== 'Informed');
    }
    return result;
  }, [plannedItems, searchTerm, informFilter]);

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);

  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, informFilter]);

  const toggleCheck = (orderId, itemId) => {
    const key = `${orderId}-${itemId}`;
    setCheckedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirmNotify = async () => {
    if (checkedRows.size === 0) return;
    setIsNotifying(true);
    const planIds = [];
    for (const { order, item, plan } of currentItems) {
      const key = `${order.order_id}-${item.item_id}`;
      if (!checkedRows.has(key)) continue;
      planIds.push(plan.plan_id);
    }
    try {
      await batchUpdateInformBeforeDispatch(planIds, 'Informed');
      setCheckedRows(new Set());
      onSave?.();
      toast.success(`Notified ${planIds.length} dispatch plan(s)`);
    } catch (err) {
      toast.error(err.message || 'Failed to update inform status');
    }
    setIsNotifying(false);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-slate-400">Loading dispatch plans...</p>
      </div>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <Bell size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Planned Dispatches</h3>
        <p className="text-sm text-slate-400">
          {searchTerm ? 'No items match your search.' : 'No orders have been planned for dispatch yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <span className="text-sm text-slate-500">
          {checkedRows.size > 0 ? `${checkedRows.size} row(s) selected` : 'Select rows to notify'}
        </span>
        <Button onClick={handleConfirmNotify} disabled={checkedRows.size === 0 || isNotifying}
          className="gap-2 px-4 font-medium">
          <Send size={16} />
          {isNotifying ? 'Notifying...' : 'Confirm Notify'}
        </Button>
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="w-10 px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center"></th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order No.</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch No.</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Inform Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Client Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Item Name</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Qty</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch Qty</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Godown Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentItems.map(({ order, item, plan }) => {
              const rowKey = `${order.order_id}-${item.item_id}`;
              return (
                  <tr key={rowKey} className={`hover:bg-slate-50 transition-colors group ${plan.dispatch_status === 'Dispatch Done' ? 'opacity-60' : ''}`}>
                  <td className="px-2 py-3 text-center">
                    <button type="button" onClick={() => toggleCheck(order.order_id, item.item_id)}
                      className="inline-flex items-center justify-center text-slate-400 hover:text-primary transition-colors">
                      {checkedRows.has(rowKey) ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {order.order_number || '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {plan.dispatch_number || '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {plan.dispatch_status === 'Dispatch Done' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Dispatch Done
                      </span>
                    ) : plan.dispatch_status === 'Partially Dispatched' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                        Partial
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        Planned
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {plan.inform_before_dispatch === 'Informed' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Informed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {order.customers?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {item.products?.name ? `${item.products.name} (${item.products.unit})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-slate-700">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {plan.quantity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {plan.dispatch_date ? format(new Date(plan.dispatch_date), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {godownMap[plan.godown_id] || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filteredItems.length > 0 && (
        <Pagination currentPage={currentPage} totalPages={totalPages}
          totalItems={filteredItems.length}
          startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
          endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)}
          onPageChange={setCurrentPage} className="border-t border-slate-200" />
      )}
    </div>
  );
};

export default InformBeforeDispatchTable;
