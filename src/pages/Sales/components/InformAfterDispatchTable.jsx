import { useState, useEffect, useMemo } from 'react';
import { Mail, Square, CheckSquare, Send, Lock } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAllDispatchPlans, batchUpdateInformAfterDispatch } from '../../../services/salesService';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 10;

const InformAfterDispatchTable = ({ searchTerm, afterFilter, onSave }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [checkedRows, setCheckedRows] = useState(() => new Set());
  const [isNotifying, setIsNotifying] = useState(false);

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, afterFilter]);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await getAllDispatchPlans();
      const done = data.filter(plan => plan.dispatch_status === 'Dispatch Done' || plan.dispatch_status === 'Partially Dispatched');
      setPlans(done);
    } catch (err) {
      toast.error('Failed to load dispatch plans');
      setPlans([]);
    }
    setLoading(false);
  };

  const filteredPlans = useMemo(() => {
    let result = plans;
    const term = searchTerm?.toLowerCase();
    if (term) {
      result = result.filter(plan =>
        plan.dispatch_number?.toLowerCase().includes(term) ||
        plan.sales_order_items?.sales_orders?.order_number?.toLowerCase().includes(term) ||
        plan.sales_order_items?.sales_orders?.customers?.name?.toLowerCase().includes(term) ||
        plan.sales_order_items?.products?.name?.toLowerCase().includes(term)
      );
    }
    if (afterFilter === 'informed') {
      result = result.filter(plan => plan.inform_after_dispatch === 'Informed');
    } else if (afterFilter === 'pending') {
      result = result.filter(plan => plan.inform_after_dispatch !== 'Informed');
    }
    return result;
  }, [plans, searchTerm, afterFilter]);

  const totalPages = Math.ceil(filteredPlans.length / ITEMS_PER_PAGE);

  const currentPlans = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPlans.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPlans, currentPage]);

  const toggleCheck = (planId) => {
    setCheckedRows(prev => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  const handleConfirmNotify = async () => {
    if (checkedRows.size === 0) return;
    setIsNotifying(true);
    const planIds = [];
    for (const plan of currentPlans) {
      if (!checkedRows.has(plan.plan_id)) continue;
      planIds.push(plan.plan_id);
    }
    try {
      await batchUpdateInformAfterDispatch(planIds, 'Informed');
      setCheckedRows(new Set());
      setPlans(prev => prev.map(p =>
        planIds.includes(p.plan_id) ? { ...p, inform_after_dispatch: 'Informed' } : p
      ));
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

  if (filteredPlans.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <Mail size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Completed Dispatches</h3>
        <p className="text-sm text-slate-400">
          {searchTerm ? 'No items match your search.' : 'No dispatches have been completed yet.'}
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
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch No.</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order No.</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Godown Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Person Name</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Qty</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatch Qty</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentPlans.map(plan => {
              const isInformed = plan.inform_after_dispatch === 'Informed';
              return (
              <tr key={plan.plan_id} className={`hover:bg-slate-50 transition-colors group ${isInformed ? 'opacity-70' : ''}`}>
                <td className="px-2 py-3 text-center">
                  {isInformed ? (
                    <Lock size={16} className="text-slate-300 mx-auto" />
                  ) : (
                    <button type="button" onClick={() => toggleCheck(plan.plan_id)}
                      className="inline-flex items-center justify-center text-slate-400 hover:text-primary transition-colors">
                      {checkedRows.has(plan.plan_id) ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {plan.dispatch_number || '—'}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {plan.dispatch_date ? format(new Date(plan.dispatch_date), 'dd/MM/yyyy') : '—'}
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {plan.sales_order_items?.sales_orders?.order_number || '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {plan.sales_order_items?.sales_orders?.customers?.name || '—'}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {plan.sales_order_items?.products?.name
                    ? `${plan.sales_order_items.products.name} (${plan.sales_order_items.products.unit})`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {plan.godowns?.name || '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {plan.users?.full_name || '—'}
                </td>
                <td className="px-4 py-3 text-center font-medium text-slate-700">
                  {plan.sales_order_items?.quantity}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                    {plan.quantity}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {isInformed ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                      Informed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                      Pending
                    </span>
                  )}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
      {filteredPlans.length > 0 && (
        <Pagination currentPage={currentPage} totalPages={totalPages}
          totalItems={filteredPlans.length}
          startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
          endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredPlans.length)}
          onPageChange={setCurrentPage} className="border-t border-slate-200" />
      )}
    </div>
  );
};

export default InformAfterDispatchTable;
