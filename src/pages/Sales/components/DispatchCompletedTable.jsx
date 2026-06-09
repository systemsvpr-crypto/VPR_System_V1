import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, Square, CheckSquare, Save, Lock, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAllDispatchPlans, completeDispatchWithStockOut } from '../../../services/salesService';
import { getAllProductStock } from '../../../services/masterService';
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
  const [stockMap, setStockMap] = useState({});

  useEffect(() => {
    loadPlans();
    loadStock();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, completeFilter]);

  const loadStock = async () => {
    try {
      const data = await getAllProductStock();
      const map = {};
      (data || []).forEach(s => {
        map[`${s.product_id}|${s.godown_id}`] = s.current_stock;
      });
      setStockMap(map);
    } catch {}
  };

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await getAllDispatchPlans();
      setPlans(data);
      const initial = {};
      data.forEach(plan => {
        initial[plan.plan_id] = {
          dispatch_date: plan.dispatch_date || '',
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

  const getCurrentStock = (productId, godownId) => {
    if (!productId || !godownId) return 0;
    return stockMap[`${productId}|${godownId}`] ?? 0;
  };

  const filteredPlans = useMemo(() => {
    let result = plans;
    result = result.filter(plan => 
      plan.sales_order_items?.sales_orders?.process_type !== 'skip_delivered' &&
      plan.inform_before_dispatch === 'Informed'
    );
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
      result = result.filter(plan => plan.dispatch_status === 'Pending' || plan.dispatch_status === 'Planned' || plan.dispatch_status === 'Partially Dispatched');
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

  const toggleCheck = (planId, isDone) => {
    if (isDone) return;
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

  const isPlanInsufficient = (plan) => {
    const vals = editValues[plan.plan_id];
    if (!vals || !vals.godown_id || !vals.quantity || Number(vals.quantity) <= 0) return false;
    const productId = plan.sales_order_items?.product_id;
    const available = getCurrentStock(productId, vals.godown_id);
    return Number(vals.quantity) > available;
  };

  const hasAnyInsufficient = useMemo(() => {
    return [...checkedRows].some(pid => {
      const plan = plans.find(p => p.plan_id === pid);
      return plan ? isPlanInsufficient(plan) : false;
    });
  }, [checkedRows, plans, editValues, stockMap]);

  const getTodayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const isFutureDate = (dateStr) => {
    if (!dateStr) return false;
    return dateStr > getTodayLocal();
  };

  const handleSave = async () => {
    if (checkedRows.size === 0) return;
    setIsSaving(true);
    const errors = [];
    let savedCount = 0;
    for (const planId of checkedRows) {
      const plan = plans.find(p => p.plan_id === planId);
      if (!plan) continue;
      const vals = editValues[planId];
      if (!vals) continue;
      if (!vals.godown_id) { errors.push(`${plan.dispatch_number || 'Plan'}: Select a godown.`); continue; }
      if (!vals.quantity || Number(vals.quantity) <= 0) { errors.push(`${plan.dispatch_number || 'Plan'}: Enter a valid quantity.`); continue; }
      if (Number(vals.quantity) > Number(plan.sales_order_items?.quantity)) {
        errors.push(`${plan.dispatch_number || 'Plan'}: Dispatch quantity (${vals.quantity}) cannot exceed total order quantity (${plan.sales_order_items?.quantity}).`);
        continue;
      }

      const dispatchDate = vals.dispatch_date || getTodayLocal();
      if (isFutureDate(dispatchDate)) { errors.push(`${plan.dispatch_number || 'Plan'}: Dispatch date cannot be in the future.`); continue; }

      const productId = plan.sales_order_items?.product_id;
      const available = getCurrentStock(productId, vals.godown_id);
      if (Number(vals.quantity) > available) { errors.push(`${plan.dispatch_number || 'Plan'}: Insufficient stock. Available: ${available}, Required: ${vals.quantity}.`); continue; }

      try {
        await completeDispatchWithStockOut({
          plan_id: planId,
          product_id: productId,
          godown_id: vals.godown_id,
          quantity: Number(vals.quantity),
          dispatch_date: dispatchDate,
          dispatch_number: plan.dispatch_number,
          created_by: plan.created_by,
        });
        savedCount++;
      } catch (err) {
        errors.push(`${plan.dispatch_number || 'Plan'}: ${err.message}`);
      }
    }
    setCheckedRows(new Set());
    if (savedCount > 0) {
      toast.success(`Completed ${savedCount} dispatch(s) with stock out`);
      onSave?.();
      await loadStock();
    }
    if (errors.length > 0) toast.error(errors[0]);
    await loadPlans();
    setIsSaving(false);
  };

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
          {checkedRows.size > 0 ? `${checkedRows.size} row(s) selected` : 'Select rows to complete dispatch'}
        </span>
        <div className="flex items-center gap-3">
          {hasAnyInsufficient && (
            <span className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle size={14} /> Some selected rows have insufficient stock
            </span>
          )}
          <Button onClick={handleSave} disabled={checkedRows.size === 0 || isSaving || hasAnyInsufficient}
            className="gap-2 px-4 font-medium">
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Complete Dispatch Out'}
          </Button>
        </div>
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
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[120px]">Available Stock</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[130px]">Dispatch Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[140px]">Person Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentPlans.map(plan => {
              const vals = editValues[plan.plan_id] || {};
              const isDone = plan.dispatch_status === 'Dispatch Done' || plan.dispatch_status === 'Cancelled';
              const isPartiallyDone = plan.dispatch_status === 'Partially Dispatched';
              const isChecked = checkedRows.has(plan.plan_id);
              const productId = plan.sales_order_items?.product_id;
              const selectedGodownId = vals.godown_id || plan.godown_id;
              const currentStock = getCurrentStock(productId, selectedGodownId);
              const qtyEntered = Number(vals.quantity || 0);
              const insufficient = isChecked && qtyEntered > 0 && qtyEntered > currentStock;
              const noStock = isChecked && currentStock === 0;
              return (
                <tr key={plan.plan_id} className={`hover:bg-slate-50 transition-colors group ${isDone ? 'opacity-70' : insufficient ? 'bg-red-50/40' : ''}`}>
                  <td className="px-2 py-3 text-center">
                    {isDone ? (
                      <Lock size={16} className="text-slate-300 mx-auto" />
                    ) : (
                      <button type="button" onClick={() => toggleCheck(plan.plan_id, isDone)}
                        className="inline-flex items-center justify-center text-slate-400 hover:text-primary transition-colors">
                        {isChecked ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                      </button>
                    )}
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
                      disabled={!isChecked || isDone} />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 w-[130px]">
                    {plan.sales_order_items?.sales_orders?.order_number || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 w-[150px]">
                    {plan.sales_order_items?.sales_orders?.customers?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700 w-[260px]">
                    {plan.sales_order_items?.products?.name
                      ? `${plan.sales_order_items.products.name} (${plan.sales_order_items.products.unit})`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 w-[220px]">
                    <Dropdown value={vals.godown_id || ''}
                      onValueChange={(v) => updateEditValue(plan.plan_id, 'godown_id', v)}
                      options={godownOptions}
                      placeholder="Select godown..." searchPlaceholder="Search godowns..."
                      disabled={!isChecked || isDone} align="start" />
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-slate-700 w-[90px]">
                    {plan.sales_order_items?.quantity}
                  </td>
                  <td className="px-4 py-3 w-[120px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <Input type="number" step="1" min="0" placeholder="0"
                        className={`w-20 h-8 text-sm text-center mx-auto ${
                          insufficient ? 'border-red-400 ring-1 ring-red-200' : ''
                        }`}
                        value={vals.quantity || ''}
                        onChange={(e) => updateEditValue(plan.plan_id, 'quantity', e.target.value.replace(/\D/g, ''))}
                        disabled={!isChecked || isDone} />
                      {insufficient && (
                        <span className="text-[10px] text-red-600 font-medium whitespace-nowrap">
                          Exceeds stock by {qtyEntered - currentStock}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center w-[120px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        insufficient || noStock
                          ? 'bg-red-50 text-red-600 border border-red-200'
                          : Number(currentStock) > 0
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          : 'bg-slate-100 text-slate-400 border border-slate-200'
                      }`}>
                        {currentStock}
                      </span>
                      {insufficient && (
                        <span className="text-[10px] text-red-500 flex items-center gap-0.5">
                          <AlertTriangle size={10} /> Short by {qtyEntered - currentStock}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center w-[130px]">
                    {plan.dispatch_status === 'Dispatch Done' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Dispatch Done
                      </span>
                    ) : plan.dispatch_status === 'Partially Dispatched' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                        Partially Dispatched
                      </span>
                    ) : plan.dispatch_status === 'Cancelled' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-100">
                        Cancelled
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
