import { useState, useEffect, useMemo } from 'react';
import {
  Mail, Square, CheckSquare, Send, Lock,
  LayoutGrid, LayoutList, Calendar, MapPin, User, Package, Clock, Check
} from 'lucide-react';
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
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('sales_inform_view_mode') || 'card');
  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('sales_inform_view_mode', mode);
  };
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
      const { notifyResults } = await batchUpdateInformAfterDispatch(planIds, 'Informed');
      setCheckedRows(new Set());
      setPlans(prev => prev.map(p =>
        planIds.includes(p.plan_id) ? { ...p, inform_after_dispatch: 'Informed' } : p
      ));
      onSave?.();

      const sentCount = notifyResults.filter(r => r.sent).length;
      const noPhoneCount = notifyResults.filter(r => !r.sent && r.reason === 'no_phone').length;
      const failedCount = notifyResults.length - sentCount - noPhoneCount;

      let message = `Marked ${planIds.length} dispatch plan(s) as informed`;
      if (sentCount > 0) message += ` — ${sentCount} WhatsApp message(s) sent`;
      if (noPhoneCount > 0) message += `, ${noPhoneCount} skipped (no phone number on file)`;
      if (failedCount > 0) message += `, ${failedCount} failed to send`;

      if (failedCount > 0) toast.error(message);
      else toast.success(message);
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



  const renderCards = () => {
    if (filteredPlans.length === 0) {
      return (
        <div className="p-12 text-center w-full flex-1 flex flex-col items-center justify-center">
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
      <div className="overflow-y-auto p-3 custom-scrollbar bg-slate-50/50 flex flex-col gap-2 flex-1 min-h-0">
        <div className="flex flex-col gap-2">
          {currentPlans.map(plan => {
            const isInformed = plan.inform_after_dispatch === 'Informed';
            const isChecked = checkedRows.has(plan.plan_id);
            const accentBorder = isInformed ? 'border-l-emerald-500' : 'border-l-blue-500';

            const orderQty = Number(plan.sales_order_items?.quantity || 0);
            const dispatchQty = Number(plan.quantity || 0);
            const pct = orderQty > 0 ? Math.min(100, Math.round((dispatchQty / orderQty) * 100)) : 0;

            return (
              <div
                key={plan.plan_id}
                className={`bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col border-l-[3.5px] ${accentBorder} ${
                  isChecked ? 'ring-2 ring-primary/20 border-primary' : ''
                } ${isInformed ? 'opacity-85' : ''}`}
              >
                {/* Main Compact Row */}
                <div className="py-2.5 px-3.5 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
                  {/* Left Column: Checkbox/Lock, Status Badge, Dispatch No, Date */}
                  <div className="flex items-center gap-2.5 shrink-0 min-w-[155px]">
                    {isInformed ? (
                      <Lock size={16} className="text-slate-300 shrink-0 mt-0.5" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCheck(plan.plan_id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5"
                      />
                    )}
                    <div className="flex flex-col gap-1">
                      <div>
                        {isInformed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 leading-none">
                            <Check size={11} className="stroke-[3]" /> Informed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 leading-none">
                            <Clock size={10} className="stroke-[2.5]" /> Pending Inform
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
                      {plan.godowns?.name && (
                        <div className="flex items-center gap-1 text-slate-600">
                          <MapPin size={12} className="text-slate-400 shrink-0" />
                          <span className="text-slate-400">Godown:</span>
                          <span className="font-semibold text-slate-800 truncate max-w-[150px]" title={plan.godowns.name}>
                            {plan.godowns.name}
                          </span>
                        </div>
                      )}
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
                    isInformed
                      ? 'bg-emerald-50/50 border-emerald-200/70'
                      : 'bg-blue-50/50 border-blue-200/70'
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md bg-white/90 border border-slate-200/60 flex items-center justify-center shrink-0 shadow-2xs">
                          <Package size={11} className={isInformed ? 'text-emerald-600' : 'text-blue-600'} />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">
                          {dispatchQty} / {orderQty} {plan.sales_order_items?.products?.unit ? String(plan.sales_order_items.products.unit).toUpperCase() : ''}
                        </span>
                      </div>
                      <span className={`text-[10px] font-semibold ${isInformed ? 'text-emerald-700' : 'text-blue-700'}`}>
                        {isInformed ? 'Informed' : 'Pending'}
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isInformed ? 'bg-emerald-500' : 'bg-blue-500'
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
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-wrap gap-2 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            {checkedRows.size > 0 ? `${checkedRows.size} row(s) selected` : 'Select rows to notify'}
          </span>
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
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
        <Button onClick={handleConfirmNotify} disabled={checkedRows.size === 0 || isNotifying}
          className="gap-2 px-4 font-medium">
          <Send size={16} />
          {isNotifying ? 'Notifying...' : 'Confirm Notify'}
        </Button>
      </div>

      {viewMode === 'card' && renderCards()}

      {viewMode === 'table' && (
        <div className="overflow-x-auto custom-scrollbar flex-1 min-h-0">
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
            {filteredPlans.length === 0 && (
              <tr>
                <td colSpan="11" className="p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                    <Mail size={32} className="text-slate-300" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-600 mb-1">No Completed Dispatches</h3>
                  <p className="text-sm text-slate-400">
                    {searchTerm ? 'No items match your search.' : 'No dispatches have been completed yet.'}
                  </p>
                </td>
              </tr>
            )}
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
      )}
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
