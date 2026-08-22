import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, Square, CheckSquare, Save, Lock, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAllDispatchPlans, completeDispatchWithStockOut, batchUpdateInformAfterDispatch } from '../../../services/salesService';
import { getAllProductStock } from '../../../services/masterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';

import { Search } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [50, 100, 200];

const DispatchCompletedTable = ({ searchTerm, onSearchChange, completeFilter, onFilterChange, onSave, products, godowns }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [checkedRows, setCheckedRows] = useState(() => new Set());
  const [editValues, setEditValues] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [stockMap, setStockMap] = useState({});

  const [orderFilter, setOrderFilter] = useState('');
  const [godownFilter, setGodownFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');

  useEffect(() => {
    loadPlans();
    loadStock();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, completeFilter, orderFilter, godownFilter, customerFilter, productFilter]);

  const loadStock = async () => {
    try {
      const data = await getAllProductStock();
      const map = {};
      (data || []).forEach(s => {
        map[`${s.product_id}|${s.godown_id}`] = s.current_stock;
      });
      setStockMap(map);
    } catch { }
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

  const filterOptions = useMemo(() => {
    const orders = new Set();
    const godownsSet = new Set();
    const customers = new Set();
    const productsSet = new Set();

    plans.forEach(p => {
      if (p.sales_order_items?.sales_orders?.process_type === 'skip_delivered') return;
      const o = p.sales_order_items?.sales_orders?.order_number;
      if (o) orders.add(o);
      const gName = godowns?.find(x => x.godown_id === p.godown_id)?.name || String(p.godown_id || '');
      if (gName) godownsSet.add(gName);
      const c = p.sales_order_items?.sales_orders?.customers?.name;
      if (c) customers.add(c);
      const pr = p.sales_order_items?.products?.name;
      if (pr) productsSet.add(pr);
    });

    return {
      orders: [...orders].sort(),
      godowns: [...godownsSet].sort(),
      customers: [...customers].sort(),
      products: [...productsSet].sort(),
    };
  }, [plans, godowns]);

  const filteredPlans = useMemo(() => {
    let result = plans;
    result = result.filter(plan =>
      plan.sales_order_items?.sales_orders?.process_type !== 'skip_delivered'
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

    if (orderFilter) {
      result = result.filter(plan => plan.sales_order_items?.sales_orders?.order_number === orderFilter);
    }
    if (godownFilter) {
      result = result.filter(plan => {
        const gName = godowns?.find(x => x.godown_id === plan.godown_id)?.name || String(plan.godown_id || '');
        return gName === godownFilter;
      });
    }
    if (customerFilter) {
      result = result.filter(plan => plan.sales_order_items?.sales_orders?.customers?.name === customerFilter);
    }
    if (productFilter) {
      result = result.filter(plan => plan.sales_order_items?.products?.name === productFilter);
    }

    return result;
  }, [plans, searchTerm, completeFilter, orderFilter, godownFilter, customerFilter, productFilter, godowns]);

  const totalPages = Math.ceil(filteredPlans.length / pageSize);

  const currentPlans = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPlans.slice(start, start + pageSize);
  }, [filteredPlans, currentPage, pageSize]);

  const toggleCheck = (planId, isDone) => {
    if (isDone) return;
    setCheckedRows(prev => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      const newChecked = new Set(checkedRows);
      currentPlans.forEach(plan => {
        const isDone = plan.dispatch_status === 'Dispatch Done' || plan.dispatch_status === 'Cancelled';
        if (!isDone) newChecked.add(plan.plan_id);
      });
      setCheckedRows(newChecked);
    } else {
      const newChecked = new Set(checkedRows);
      currentPlans.forEach(plan => {
        newChecked.delete(plan.plan_id);
      });
      setCheckedRows(newChecked);
    }
  };

  const updateEditValue = (planId, field, value) => {
    setEditValues(prev => ({
      ...prev,
      [planId]: { ...prev[planId], [field]: value },
    }));
  };

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
    const completedPlanIds = [];
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
        completedPlanIds.push(planId);
      } catch (err) {
        errors.push(`${plan.dispatch_number || 'Plan'}: ${err.message}`);
      }
    }
    setCheckedRows(new Set());

    if (completedPlanIds.length > 0) {
      // Completing a dispatch here also does the "Inform After Dispatch" step
      // in the same action — marks it Informed AND sends the customer their
      // real WhatsApp dispatch-confirmation message, instead of needing a
      // separate manual visit to the Inform After Dispatch tab.
      let notifyResults = [];
      try {
        const result = await batchUpdateInformAfterDispatch(completedPlanIds, 'Informed');
        notifyResults = result.notifyResults || [];
      } catch (err) {
        errors.push(`Completed, but failed to mark as informed: ${err.message}`);
      }

      const sentCount = notifyResults.filter(r => r.sent).length;
      const noPhoneCount = notifyResults.filter(r => !r.sent && r.reason === 'no_phone').length;
      const failedCount = notifyResults.length - sentCount - noPhoneCount;

      let message = `Completed ${completedPlanIds.length} dispatch(es) with stock out`;
      if (sentCount > 0) message += ` — ${sentCount} customer(s) notified via WhatsApp`;
      if (noPhoneCount > 0) message += `, ${noPhoneCount} skipped (no phone number on file)`;
      if (failedCount > 0) message += `, ${failedCount} WhatsApp message(s) failed to send`;

      if (failedCount > 0) toast.error(message);
      else toast.success(message);

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



  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 shrink-0">
          {[
            { id: 'pending', label: 'Pending' },
            { id: 'dispatch-done', label: 'Dispatch Done' },
          ].map(f => (
            <button key={f.id} type="button" onClick={() => onFilterChange?.(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${completeFilter === f.id
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
                }`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
          <Input type="text" placeholder="Search dispatch plans..." className="pl-9 h-9"
            value={searchTerm} onChange={(e) => onSearchChange?.(e.target.value)} />
        </div>

        <select
          value={orderFilter}
          onChange={e => setOrderFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[120px] shrink-0"
        >
          <option value="">All Orders</option>
          {filterOptions.orders.map(o => <option key={o} value={o}>{o}</option>)}
        </select>

        <select
          value={productFilter}
          onChange={e => setProductFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[120px] shrink-0"
        >
          <option value="">All Products</option>
          {filterOptions.products.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select
          value={customerFilter}
          onChange={e => setCustomerFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[120px] shrink-0"
        >
          <option value="">All Customers</option>
          {filterOptions.customers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={godownFilter}
          onChange={e => setGodownFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[120px] shrink-0"
        >
          <option value="">All Godowns</option>
          {filterOptions.godowns.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <Button onClick={handleSave} disabled={checkedRows.size === 0 || isSaving}
          className="gap-2 px-4 font-medium h-9 w-full sm:w-auto text-xs sm:ml-auto shrink-0">
          <Save size={16} />
          {isSaving ? 'Completing...' : 'Complete & Notify'}
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 flex flex-col flex-1 min-h-0">
        <div className="overflow-x-auto custom-scrollbar flex-1 min-h-0">
          <table className="w-full text-xs relative">
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr className="bg-blue-50 border-b border-slate-200">
                <th className="w-10 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center whitespace-nowrap">
                  <div className="flex items-center justify-center gap-2">
                    <input type="checkbox"
                      checked={currentPlans.length > 0 && currentPlans.filter(p => p.dispatch_status !== 'Dispatch Done' && p.dispatch_status !== 'Cancelled').length > 0 && currentPlans.filter(p => p.dispatch_status !== 'Dispatch Done' && p.dispatch_status !== 'Cancelled').every(p => checkedRows.has(p.plan_id))}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                  </div>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[120px] whitespace-nowrap">Dispatch No.</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[180px] whitespace-nowrap">Dispatch Date</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[130px] whitespace-nowrap">Order No.</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[150px] whitespace-nowrap">Customer Name</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[260px] whitespace-nowrap">Product Name</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[100px] whitespace-nowrap">Unit</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[220px] whitespace-nowrap">Godown Name</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[90px] whitespace-nowrap">Order Qty</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[110px] whitespace-nowrap">Dispatch Qty</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[130px] whitespace-nowrap">Dispatch Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-[140px] whitespace-nowrap">Person Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentPlans.map(plan => {
                const vals = editValues[plan.plan_id] || {};
                const isDone = plan.dispatch_status === 'Dispatch Done' || plan.dispatch_status === 'Cancelled';
                const isPartiallyDone = plan.dispatch_status === 'Partially Dispatched';
                const isChecked = checkedRows.has(plan.plan_id);
                return (
                  <tr key={plan.plan_id} className={`hover:bg-slate-50 transition-colors group ${isDone ? 'opacity-70' : ''}`}>
                    <td className="px-2 py-3 text-center whitespace-nowrap">
                      {isDone ? (
                        <Lock size={16} className="text-slate-300 mx-auto" />
                      ) : (
                        <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(plan.plan_id, isDone)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer align-middle" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-slate-800 w-[120px] whitespace-nowrap">
                      {plan.dispatch_number || '—'}
                    </td>
                    <td className="px-4 py-3 text-center w-[180px] whitespace-nowrap">
                      <DatePicker
                        value={vals.dispatch_date || ''}
                        onChange={(e) => updateEditValue(plan.plan_id, 'dispatch_date', e.target.value)}
                        name="dispatch_date"
                        placeholder="Select dispatch date..."
                        className="h-8 text-xs text-center"
                        disabled={!isChecked || isDone} />
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-slate-800 w-[130px] whitespace-nowrap">
                      {plan.sales_order_items?.sales_orders?.order_number || '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600 w-[150px] whitespace-nowrap">
                      {plan.sales_order_items?.sales_orders?.customers?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700 w-[260px] whitespace-nowrap">
                      {plan.sales_order_items?.products?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-center w-[100px] whitespace-nowrap">
                      {plan.sales_order_items?.products?.unit ? (
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">
                          {plan.sales_order_items.products.unit}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700 w-[220px] whitespace-nowrap">
                      {godowns?.find(g => String(g.godown_id) === String(plan.godown_id))?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-slate-700 w-[90px] whitespace-nowrap">
                      {plan.sales_order_items?.quantity}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-slate-700 w-[120px] whitespace-nowrap">
                      {plan.quantity || '0'}
                    </td>
                    <td className="px-4 py-3 text-center w-[130px] whitespace-nowrap">
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
                    <td className="px-4 py-3 text-center text-slate-600 w-[140px] whitespace-nowrap">
                      {plan.users?.full_name || '—'}
                    </td>
                  </tr>
                );
              })}
              {currentPlans.length === 0 && (
                <tr>
                  <td colSpan="12" className="p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                      <CheckCircle size={32} className="text-slate-300" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-600 mb-1">No Dispatch Plans</h3>
                    <p className="text-sm text-slate-400">
                      {searchTerm ? 'No items match your search.' : 'No dispatch plans found.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="px-4 py-2.5 border-t border-royal-600/25 bg-blue-50 flex items-center justify-between gap-4 rounded-b-xl shrink-0">
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="ring-1 ring-royal-600/25 rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-royal-500/30 bg-white font-medium text-xs md:text-sm"
              >
                {PAGE_SIZE_OPTIONS.map((val) => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
              <span className="text-[10px] md:text-sm text-slate-600 whitespace-nowrap font-medium hidden sm:inline">
                {filteredPlans.length > 0 ? ((currentPage - 1) * pageSize) + 1 : 0}-{Math.min(currentPage * pageSize, filteredPlans.length)} of {filteredPlans.length}
              </span>
            </div>

            <div className="flex items-center gap-2 md:gap-4 text-slate-700">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 md:px-2 md:py-1 ring-1 ring-royal-600/25 rounded-xl bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-royal-50 transition flex items-center justify-center text-royal-600"
              >
                <ChevronLeft size={16} strokeWidth={2.5} />
              </button>
              <div className="flex items-center text-xs md:text-sm font-semibold text-slate-600">
                {currentPage} / {totalPages || 1}
              </div>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === Math.max(1, totalPages)}
                className="p-1.5 md:px-2 md:py-1 ring-1 ring-royal-600/25 rounded-xl bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-royal-50 transition flex items-center justify-center text-royal-600"
              >
                <ChevronRight size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
      </div>
    </>
  );
};

export default DispatchCompletedTable;
