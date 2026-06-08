import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, Square, CheckSquare, Save } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAllDispatchPlans, updateDispatchPlan, updateOrderItemProduct } from '../../../services/salesService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';
import Pagination from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 10;

const DispatchCompletedTable = ({ searchTerm, completeFilter, onSave, products, godowns }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [checkedRows, setCheckedRows] = useState(() => new Set());
  const [editValues, setEditValues] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, completeFilter]);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await getAllDispatchPlans();
      setPlans(data);
      const initial = {};
      data.forEach(plan => {
        initial[plan.plan_id] = {
          dispatch_date: plan.dispatch_date || '',
          product_id: plan.sales_order_items?.product_id || '',
          godown_id: plan.godown_id || '',
          quantity: plan.quantity ? String(plan.quantity) : '',
        };
      });
      setEditValues(initial);
    } catch (err) {
      toast.error('Failed to load dispatch plans');
      setPlans([]);
    }
    setLoading(false);
  };

  const filteredPlans = useMemo(() => {
    let result = plans;
    result = result.filter(plan => plan.sales_order_items?.sales_orders?.process_type !== 'skip_delivered');
    const term = searchTerm?.toLowerCase();
    if (term) {
      result = result.filter(plan =>
        plan.dispatch_number?.toLowerCase().includes(term) ||
        plan.sales_order_items?.sales_orders?.order_number?.toLowerCase().includes(term) ||
        plan.sales_order_items?.sales_orders?.customers?.name?.toLowerCase().includes(term) ||
        plan.sales_order_items?.products?.name?.toLowerCase().includes(term)
      );
    }
    if (completeFilter === 'pending') {
      result = result.filter(plan => plan.dispatch_status !== 'Dispatch Done');
    } else if (completeFilter === 'dispatch-done') {
      result = result.filter(plan => plan.dispatch_status === 'Dispatch Done');
    }
    return result;
  }, [plans, searchTerm, completeFilter]);

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

  const updateEditValue = (planId, field, value) => {
    setEditValues(prev => ({
      ...prev,
      [planId]: { ...prev[planId], [field]: value },
    }));
  };

  const handleSave = async () => {
    if (checkedRows.size === 0) return;
    setIsSaving(true);
    const errors = [];
    for (const planId of checkedRows) {
      const plan = plans.find(p => p.plan_id === planId);
      if (!plan) continue;
      const vals = editValues[planId];
      if (!vals) continue;
      try {
        await updateDispatchPlan(planId, {
          dispatch_date: vals.dispatch_date,
          godown_id: vals.godown_id,
          quantity: vals.quantity,
          dispatch_status: 'Dispatch Done',
        });
        if (vals.product_id && vals.product_id !== plan.sales_order_items?.product_id) {
          await updateOrderItemProduct(plan.sales_order_items?.item_id, vals.product_id);
        }
      } catch (err) {
        errors.push(`Plan ${plan.dispatch_number}: ${err.message}`);
      }
    }
    if (errors.length === 0) {
      toast.success(`Saved ${checkedRows.size} plan(s)`);
    } else {
      toast.error(errors[0]);
    }
    setCheckedRows(new Set());
    await loadPlans();
    onSave?.();
    setIsSaving(false);
  };

  const activeProducts = products?.filter(p => p.is_active !== false) || [];
  const productOptions = activeProducts.map(p => ({ value: p.product_id, label: `${p.name} (${p.unit})` }));

  const activeGodowns = godowns?.filter(g => g.is_active) || [];
  const godownOptions = activeGodowns.map(g => ({ value: g.godown_id, label: g.name }));

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
          <CheckCircle size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Dispatch Plans</h3>
        <p className="text-sm text-slate-400">
          {searchTerm ? 'No items match your search.' : 'No dispatch plans have been created yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <span className="text-sm text-slate-500">
          {checkedRows.size > 0 ? `${checkedRows.size} row(s) selected` : 'Select rows to edit'}
        </span>
        <Button onClick={handleSave} disabled={checkedRows.size === 0 || isSaving}
          className="gap-2 px-4 font-medium">
          <Save size={16} />
          {isSaving ? 'Saving...' : 'Save Selected'}
        </Button>
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm whitespace-nowrap min-w-[1550px]">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="w-10 px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center"></th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[120px]">Dispatch No.</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[180px]">Dispatch Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[130px]">Order No.</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[150px]">Customer Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[260px]">Product Name</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[220px]">Godown Name</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[90px]">Order Qty</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[110px]">Dispatch Qty</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[130px]">Dispatch Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[140px]">Person Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentPlans.map(plan => {
              const vals = editValues[plan.plan_id] || {};
              const isChecked = checkedRows.has(plan.plan_id);
              return (
                <tr key={plan.plan_id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-2 py-3 text-center">
                    <button type="button" onClick={() => toggleCheck(plan.plan_id)}
                      className="inline-flex items-center justify-center text-slate-400 hover:text-primary transition-colors">
                      {isChecked ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 w-[120px]">
                    {plan.dispatch_number || '—'}
                  </td>
                  <td className="px-4 py-3 w-[180px]">
                    <DatePicker
                      value={vals.dispatch_date || ''}
                      onChange={(e) => updateEditValue(plan.plan_id, 'dispatch_date', e.target.value)}
                      name="dispatch_date"
                      placeholder="Select dispatch date..."
                      disabled={!isChecked} />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 w-[130px]">
                    {plan.sales_order_items?.sales_orders?.order_number || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 w-[150px]">
                    {plan.sales_order_items?.sales_orders?.customers?.name || '—'}
                  </td>
                  <td className="px-4 py-3 w-[260px]">
                    <Dropdown value={vals.product_id || ''}
                      onValueChange={(v) => updateEditValue(plan.plan_id, 'product_id', v)}
                      options={productOptions}
                      placeholder="Select product..." searchPlaceholder="Search products..."
                      disabled={!isChecked} align="start" />
                  </td>
                  <td className="px-4 py-3 w-[220px]">
                    <Dropdown value={vals.godown_id || ''}
                      onValueChange={(v) => updateEditValue(plan.plan_id, 'godown_id', v)}
                      options={godownOptions}
                      placeholder="Select godown..." searchPlaceholder="Search godowns..."
                      disabled={!isChecked} align="start" />
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-slate-700 w-[90px]">
                    {plan.sales_order_items?.quantity}
                  </td>
                  <td className="px-4 py-3 w-[110px]">
                    <Input type="number" step="1" min="0" placeholder="0"
                      className="w-20 h-8 text-sm text-center mx-auto"
                      value={vals.quantity || ''}
                      onChange={(e) => updateEditValue(plan.plan_id, 'quantity', e.target.value.replace(/\D/g, ''))}
                      disabled={!isChecked} />
                  </td>
                  <td className="px-4 py-3 text-center w-[130px]">
                    {plan.dispatch_status === 'Dispatch Done' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Dispatch Done
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 w-[140px]">
                    {plan.users?.full_name || '—'}
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

export default DispatchCompletedTable;
