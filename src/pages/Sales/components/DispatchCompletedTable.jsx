import { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle, Square, CheckSquare, Save, Lock, AlertTriangle, ChevronLeft, ChevronRight, Trash2,
  LayoutGrid, LayoutList, Calendar, MapPin, User, Package, Clock, RotateCw, Check, Ban, Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getAllDispatchPlans, completeDispatchWithStockOut, batchUpdateInformAfterDispatch, deleteDispatchPlansBulk } from '../../../services/salesService';
import { getAllProductStock } from '../../../services/masterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import FilterMenu from '@/components/FilterMenu';
import { DatePicker } from '@/components/ui/date-picker';
import { format } from 'date-fns';

const PAGE_SIZE_OPTIONS = [50, 100, 200];

const DispatchCompletedTable = ({ searchTerm, onSearchChange, completeFilter, onFilterChange, onSave, products, godowns, user }) => {
  // Same gate as Dispatch Planning's "Delete Selected" — this permanently
  // wipes rows out of dispatch_plans/transactions.
  const roleUpper = String(user?.role || '').trim().toUpperCase();
  const isSuperAdmin = roleUpper === 'SUPER ADMIN' || roleUpper === 'SUPER_ADMIN' || roleUpper === 'SUPERADMIN';
  const canDelete = import.meta.env.DEV || isSuperAdmin;

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('sales_dispatch_completed_view_mode') || 'card');
  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('sales_dispatch_completed_view_mode', mode);
  };
  const [checkedRows, setCheckedRows] = useState(() => new Set());
  const [editValues, setEditValues] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
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

      // Dispatch Planning already allows a future dispatch_date (stock is
      // reduced immediately at planning time regardless of date), so
      // Complete & Notify has to accept that same future date rather than
      // reject it here.
      const dispatchDate = vals.dispatch_date || getTodayLocal();

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

  // Permanently removes the checked plans and their stock transactions —
  // for undoing a wrongly created/planned dispatch. The order item itself
  // is untouched (unlike Dispatch Planning's "Delete Selected", which also
  // removes the sales_order_items row), so it simply becomes pending again.
  // Locked (Dispatch Done/Cancelled) rows can't be checked in the first
  // place, so this only ever runs against Pending/Planned/Partially
  // Dispatched plans.
  const handleDeleteSelected = async () => {
    if (checkedRows.size === 0) return;
    const planIds = [...checkedRows];
    const confirmMsg = planIds.length === 1
      ? 'Permanently delete this dispatch plan and its stock transaction? This cannot be undone.'
      : `Permanently delete ${planIds.length} selected dispatch plans and their stock transactions? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingSelected(true);
    try {
      const { deletedCount } = await deleteDispatchPlansBulk(planIds);
      setCheckedRows(new Set());
      toast.success(`Deleted ${deletedCount} dispatch plan${deletedCount !== 1 ? 's' : ''}.`);
      await loadPlans();
      await loadStock();
      onSave?.();
    } catch (err) {
      toast.error(err.message || 'Failed to delete selected plans.');
    }
    setDeletingSelected(false);
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



  const renderCards = () => {
    if (filteredPlans.length === 0) {
      return (
        <div className="p-12 text-center w-full flex-1 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <CheckCircle size={32} className="text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-600 mb-1">No Dispatch Plans</h3>
          <p className="text-sm text-slate-400">
            {searchTerm ? 'No items match your search.' : 'No dispatch plans found.'}
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-y-auto p-3 custom-scrollbar bg-slate-50/50 flex flex-col gap-2 flex-1 min-h-0">
        <div className="flex flex-col gap-2">
          {currentPlans.map(plan => {
            const vals = editValues[plan.plan_id] || {};
            const isDone = plan.dispatch_status === 'Dispatch Done' || plan.dispatch_status === 'Cancelled';
            const isPartiallyDone = plan.dispatch_status === 'Partially Dispatched';
            const isChecked = checkedRows.has(plan.plan_id);

            const accentBorder = plan.dispatch_status === 'Dispatch Done'
              ? 'border-l-emerald-500'
              : plan.dispatch_status === 'Cancelled'
              ? 'border-l-red-500'
              : isPartiallyDone
              ? 'border-l-amber-500'
              : 'border-l-blue-500';

            const orderQty = Number(plan.sales_order_items?.quantity || 0);
            const dispatchQty = Number(plan.quantity || 0);
            const pct = orderQty > 0 ? Math.min(100, Math.round((dispatchQty / orderQty) * 100)) : 0;
            const godownName = godowns?.find(g => String(g.godown_id) === String(plan.godown_id))?.name || '—';

            return (
              <div
                key={plan.plan_id}
                className={`bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col border-l-[3.5px] ${accentBorder} ${
                  isChecked ? 'ring-2 ring-primary/20 border-primary' : ''
                } ${isDone ? 'opacity-85' : ''}`}
              >
                {/* Main Compact Row */}
                <div className="py-2.5 px-3.5 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
                  {/* Left Column: Checkbox/Lock, Status Badge, Dispatch No, Date */}
                  <div className="flex items-center gap-2.5 shrink-0 min-w-[155px]">
                    {isDone ? (
                      <Lock size={16} className="text-slate-300 shrink-0 mt-0.5" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(plan.plan_id, isDone)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5"
                      />
                    )}
                    <div className="flex flex-col gap-1">
                      <div>
                        {plan.dispatch_status === 'Dispatch Done' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 leading-none">
                            <Check size={11} className="stroke-[3]" /> Dispatch Done
                          </span>
                        ) : plan.dispatch_status === 'Cancelled' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 leading-none">
                            <Ban size={10} className="stroke-[2.5]" /> Cancelled
                          </span>
                        ) : isPartiallyDone ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 leading-none">
                            <Clock size={10} className="stroke-[2.5]" /> Partially Dispatched
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 leading-none">
                            <RotateCw size={10} className="stroke-[2.5]" /> Pending
                          </span>
                        )}
                      </div>
                      <div className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight">
                        {plan.dispatch_number || '—'}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium whitespace-nowrap leading-none">
                        <Calendar size={11} className="text-slate-400 shrink-0" />
                        <span>Date: {plan.dispatch_date ? format(new Date(plan.dispatch_date), 'dd MMM yyyy') : '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vertical Divider */}
                  <div className="hidden xl:block w-px self-stretch bg-slate-200/70 my-0.5" />

                  {/* Middle Column: Product Avatar, Name, Badges, Metadata Row */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
                        {plan.sales_order_items?.products?.image_url ? (
                          <img src={plan.sales_order_items.products.image_url} alt={plan.sales_order_items?.products?.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                            <Package size={18} className="text-slate-400" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm truncate" title={plan.sales_order_items?.products?.name}>
                            {plan.sales_order_items?.products?.name || '—'}
                          </span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 leading-none">
                            Order: {plan.sales_order_items?.sales_orders?.order_number || '—'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium leading-tight">
                          Unit: {plan.sales_order_items?.products?.unit ? String(plan.sales_order_items.products.unit).toUpperCase() : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Metadata Row: Customer, Godown, Person */}
                    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px]">
                      <div className="flex items-center gap-1 text-slate-600">
                        <User size={12} className="text-slate-400 shrink-0" />
                        <span className="text-slate-400">Customer:</span>
                        <span className="font-medium text-slate-700 truncate max-w-[150px]" title={plan.sales_order_items?.sales_orders?.customers?.name}>
                          {plan.sales_order_items?.sales_orders?.customers?.name || '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-600">
                        <MapPin size={12} className="text-slate-400 shrink-0" />
                        <span className="text-slate-400">Godown:</span>
                        <span className="font-semibold text-slate-800 truncate max-w-[150px]" title={godownName}>
                          {godownName}
                        </span>
                      </div>
                      {plan.users?.full_name && (
                        <div className="flex items-center gap-1 text-slate-600">
                          <User size={12} className="text-slate-400 shrink-0" />
                          <span className="text-slate-400">Person:</span>
                          <span className="font-medium text-slate-700">{plan.users.full_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Vertical Divider */}
                  <div className="hidden xl:block w-px self-stretch bg-slate-200/70 my-0.5" />

                  {/* Middle-Right: Quantities / Progress Box */}
                  <div className={`py-1.5 px-3 rounded-lg border flex flex-col justify-between gap-1.5 min-w-[190px] sm:min-w-[210px] shrink-0 ${
                    plan.dispatch_status === 'Dispatch Done'
                      ? 'bg-emerald-50/50 border-emerald-200/70'
                      : plan.dispatch_status === 'Cancelled'
                      ? 'bg-red-50/50 border-red-200/70'
                      : isPartiallyDone
                      ? 'bg-amber-50/50 border-amber-200/70'
                      : 'bg-blue-50/50 border-blue-200/70'
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md bg-white/90 border border-slate-200/60 flex items-center justify-center shrink-0 shadow-2xs">
                          <Package size={11} className={
                            plan.dispatch_status === 'Dispatch Done'
                              ? 'text-emerald-600'
                              : plan.dispatch_status === 'Cancelled'
                              ? 'text-red-600'
                              : 'text-blue-600'
                          } />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">
                          {dispatchQty} / {orderQty} {plan.sales_order_items?.products?.unit ? String(plan.sales_order_items.products.unit).toUpperCase() : ''}
                        </span>
                      </div>
                      <span className={`text-[10px] font-semibold ${
                        plan.dispatch_status === 'Dispatch Done'
                          ? 'text-emerald-700'
                          : plan.dispatch_status === 'Cancelled'
                          ? 'text-red-600'
                          : isPartiallyDone
                          ? 'text-amber-700'
                          : 'text-blue-700'
                      }`}>
                        {plan.dispatch_status === 'Dispatch Done' ? '100% Done' : `${pct}%`}
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          plan.dispatch_status === 'Dispatch Done'
                            ? 'bg-emerald-500'
                            : plan.dispatch_status === 'Cancelled'
                            ? 'bg-red-500'
                            : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <div>
                        <span>Order Qty:</span>
                        <span className="ml-1 font-semibold text-slate-800">{orderQty}</span>
                      </div>
                      <div>
                        <span>Disp Qty:</span>
                        <span className="ml-1 font-bold text-emerald-700">{dispatchQty}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inline Dispatch Date Picker Row (when not done) */}
                {!isDone && (
                  <div className={`border-t border-slate-100 px-3.5 py-2 flex items-center gap-2.5 flex-wrap transition-colors ${
                    isChecked ? 'bg-primary/5' : 'bg-slate-50/70'
                  }`}>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Dispatch Date:</span>
                    <DatePicker
                      value={vals.dispatch_date || ''}
                      onChange={(e) => updateEditValue(plan.plan_id, 'dispatch_date', e.target.value)}
                      name="dispatch_date"
                      placeholder="Select dispatch date..."
                      className="h-8 text-xs w-36 bg-white"
                      disabled={!isChecked}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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

        <FilterMenu
          activeCount={([orderFilter, productFilter, customerFilter, godownFilter]).filter(Boolean).length}
          onClear={() => { setOrderFilter(''); setProductFilter(''); setCustomerFilter(''); setGodownFilter(''); }}
        >
          <Dropdown
            value={orderFilter}
            onValueChange={setOrderFilter}
            options={[{ value: '', label: 'All Orders' }, ...filterOptions.orders.map(o => ({ value: o, label: o }))]}
            placeholder="All Orders"
            searchPlaceholder="Search orders..."
            className="h-9 w-full text-xs"
          />

          <Dropdown
            value={productFilter}
            onValueChange={setProductFilter}
            options={[{ value: '', label: 'All Products' }, ...filterOptions.products.map(p => ({ value: p, label: p }))]}
            placeholder="All Products"
            searchPlaceholder="Search products..."
            className="h-9 w-full text-xs"
          />

          <Dropdown
            value={customerFilter}
            onValueChange={setCustomerFilter}
            options={[{ value: '', label: 'All Customers' }, ...filterOptions.customers.map(c => ({ value: c, label: c }))]}
            placeholder="All Customers"
            searchPlaceholder="Search customers..."
            className="h-9 w-full text-xs"
          />

          <Dropdown
            value={godownFilter}
            onValueChange={setGodownFilter}
            options={[{ value: '', label: 'All Godowns' }, ...filterOptions.godowns.map(g => ({ value: g, label: g }))]}
            placeholder="All Godowns"
            searchPlaceholder="Search godowns..."
            className="h-9 w-full text-xs"
          />
        </FilterMenu>

        <Button onClick={handleSave} disabled={checkedRows.size === 0 || isSaving}
          className="gap-2 px-4 font-medium h-9 w-full sm:w-auto text-xs sm:ml-auto shrink-0">
          <Save size={16} />
          {isSaving ? 'Completing...' : 'Complete'}
        </Button>

        {canDelete && (
          <Button variant="destructive" onClick={handleDeleteSelected} disabled={checkedRows.size === 0 || deletingSelected}
            className="gap-2 px-4 font-medium h-9 w-full sm:w-auto text-xs shrink-0">
            <Trash2 size={16} />
            {deletingSelected ? 'Deleting...' : 'Delete'}
          </Button>
        )}

        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => handleViewModeChange('card')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'card'
                ? 'bg-white text-primary shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Card View"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            type="button"
            onClick={() => handleViewModeChange('table')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'table'
                ? 'bg-white text-primary shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Table View"
          >
            <LayoutList size={15} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 flex flex-col flex-1 min-h-0">
        {/* Sub-header */}
        <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-400 flex-wrap shrink-0">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
            <input type="checkbox"
              checked={currentPlans.length > 0 && currentPlans.filter(p => p.dispatch_status !== 'Dispatch Done' && p.dispatch_status !== 'Cancelled').length > 0 && currentPlans.filter(p => p.dispatch_status !== 'Dispatch Done' && p.dispatch_status !== 'Cancelled').every(p => checkedRows.has(p.plan_id))}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
            Select All
          </label>
          <span className="ml-auto font-medium text-slate-500">
            {filteredPlans.length} item{filteredPlans.length !== 1 ? 's' : ''}
          </span>
        </div>

        {viewMode === 'card' && renderCards()}

        {viewMode === 'table' && (
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
      )}
        
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
