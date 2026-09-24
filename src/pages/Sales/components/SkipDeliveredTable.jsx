import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Truck, CheckCircle2, ChevronDown, ChevronUp, Package, Calendar,
  User, LayoutGrid, LayoutList, Check, Clock, AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getSkipDeliveredItems } from '../../../services/salesService';
import Pagination from '@/components/ui/pagination';
import SkipDeliverModal from './SkipDeliverModal';

const ITEMS_PER_PAGE = 10;

/* ─── status badge ──────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const map = {
    Pending:                'bg-amber-50 text-amber-700 border-amber-200',
    'Partially Dispatched': 'bg-blue-50 text-blue-700 border-blue-200',
    'Skip Done':            'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border leading-none ${map[status] || map.Pending}`}>
      {status === 'Skip Done' ? <Check size={11} className="stroke-[3]" /> : status === 'Partially Dispatched' ? <Clock size={10} className="stroke-[2.5]" /> : <AlertCircle size={10} className="stroke-[2.5]" />}
      {status}
    </span>
  );
};

/* ──────────────────────────────────────────────────────────
   Main component
────────────────────────────────────────────────────────── */
const SkipDeliveredTable = ({ searchTerm, skipFilter, onSave, products, godowns, user, customers }) => {
  const [items, setItems]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [dispatchItem, setDispatchItem]   = useState(null);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('sales_skip_view_mode') || 'card');

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('sales_skip_view_mode', mode);
  };

  useEffect(() => { loadItems(); }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, skipFilter]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await getSkipDeliveredItems();
      setItems(data);
    } catch {
      toast.error('Failed to load skip delivered items');
      setItems([]);
    }
    setLoading(false);
  };

  const toggleExpand = (itemId) =>
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });

  const itemsWithMeta = useMemo(() =>
    items.map(item => {
      const activePlans     = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
      const cancelledQty    = Number(item.cancelled_quantity || 0);
      const effectiveQty    = Number(item.quantity) - cancelledQty;
      const alreadyDispatched = activePlans.reduce((s, p) => s + Number(p.already_dispatched || 0), 0);
      const remaining       = effectiveQty - alreadyDispatched;
      return { ...item, activePlans, cancelledQty, effectiveQty, alreadyDispatched, remaining };
    }),
    [items],
  );

  const filteredItems = useMemo(() => {
    let result = itemsWithMeta;
    const term = searchTerm?.toLowerCase();
    if (term) {
      result = result.filter(item =>
        item.sales_orders?.order_number?.toLowerCase().includes(term) ||
        item.sales_orders?.customers?.name?.toLowerCase().includes(term) ||
        item.products?.name?.toLowerCase().includes(term)
      );
    }
    if (skipFilter === 'pending') {
      result = result.filter(item => item.activePlans.length === 0);
    } else if (skipFilter === 'partial') {
      result = result.filter(item => item.activePlans.length > 0 && item.remaining > 0);
    } else if (skipFilter === 'skip-done') {
      result = result.filter(item => item.activePlans.length > 0 && item.remaining <= 0);
    }
    return result;
  }, [itemsWithMeta, searchTerm, skipFilter]);

  const totalPages   = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));

  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, currentPage]);

  const openDispatch = (item) => {
    setDispatchItem(item);
    setDispatchModalOpen(true);
  };

  const closeDispatch = () => {
    setDispatchModalOpen(false);
    setDispatchItem(null);
  };

  const handleSaved = () => {
    loadItems();
    onSave?.();
    closeDispatch();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading skip delivered items...</p>
      </div>
    );
  }

  /* ─── Render Unified Compact Cards ─────────────────────── */
  const renderCards = () => (
    <div className="p-3 bg-slate-50/50 flex-1 overflow-y-auto custom-scrollbar">
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center w-full bg-white rounded-xl border border-slate-200/80">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <Truck size={32} className="text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-600 mb-1">No Skip Delivered Items</h3>
          <p className="text-sm text-slate-400">
            {searchTerm
              ? 'No items match your search.'
              : skipFilter === 'pending'
              ? 'All items have been dispatched.'
              : skipFilter === 'partial'
              ? 'No partially dispatched items.'
              : skipFilter === 'skip-done'
              ? 'No completed dispatches yet.'
              : 'No orders marked as Skip Delivered.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {currentItems.map(item => {
            const isExpanded = expandedItems.has(item.item_id);
            const hasPlans   = item.activePlans.length > 0;
            const done       = item.remaining <= 0;
            const status     = !hasPlans ? 'Pending' : done ? 'Skip Done' : 'Partially Dispatched';

            const accentBorder = done
              ? 'border-l-[3.5px] border-l-emerald-500'
              : hasPlans
              ? 'border-l-[3.5px] border-l-blue-500'
              : 'border-l-[3.5px] border-l-amber-500';

            const pctDispatched = item.effectiveQty > 0
              ? Math.min(100, Math.round((item.alreadyDispatched / item.effectiveQty) * 100))
              : (item.alreadyDispatched > 0 ? 100 : 0);

            const unit = item.products?.unit || 'Kg';

            return (
              <div
                key={item.item_id}
                className={`bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col ${accentBorder}`}
              >
                {/* Main Compact 1-Card Row */}
                <div className="py-2.5 px-3.5 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
                  {/* Left Column: Status Badge, Order Number, Date */}
                  <div className="flex items-start gap-2.5 shrink-0 xl:w-56">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div>
                        <StatusBadge status={status} />
                      </div>
                      <div className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight truncate">
                        {item.sales_orders?.order_number || '—'}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium whitespace-nowrap leading-none">
                        <Calendar size={11} className="text-slate-400 shrink-0" />
                        <span>Order Date: {item.sales_orders?.order_date ? format(new Date(item.sales_orders.order_date), 'dd MMM yyyy') : '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vertical Divider */}
                  <div className="hidden xl:block w-px self-stretch bg-slate-200/70 my-0.5" />

                  {/* Middle Column: Product Avatar, Name (NO group), Unit, Customer metadata */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
                        {item.products?.image_url ? (
                          <img src={item.products.image_url} alt={item.products?.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                            <Package size={18} className="text-slate-400" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm truncate" title={item.products?.name}>
                            {item.products?.name || '—'}
                          </span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 leading-none">
                            Skip Delivered
                          </span>
                          {item.cancelledQty > 0 && (
                            <span className="text-[10px] text-red-600 bg-red-50 border border-red-200/60 px-1.5 py-0.5 rounded font-medium">
                              {item.cancelledQty} cancelled
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium leading-tight">
                          Unit: {item.products?.unit ? String(item.products.unit).toUpperCase() : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Metadata Row: Customer */}
                    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px]">
                      <div className="flex items-center gap-1 text-slate-600">
                        <User size={12} className="text-slate-400 shrink-0" />
                        <span className="text-slate-400">Customer:</span>
                        <span className="font-medium text-slate-700 truncate max-w-[180px]" title={item.sales_orders?.customers?.name}>
                          {item.sales_orders?.customers?.name || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Vertical Divider */}
                  <div className="hidden xl:block w-px self-stretch bg-slate-200/70 my-0.5" />

                  {/* Middle-Right: Quantities / Progress Box */}
                  <div className={`py-1.5 px-3 rounded-lg border flex flex-col justify-between gap-1.5 min-w-[200px] sm:min-w-[220px] shrink-0 ${
                    done
                      ? 'bg-emerald-50/50 border-emerald-200/70'
                      : hasPlans
                      ? 'bg-blue-50/50 border-blue-200/70'
                      : 'bg-amber-50/50 border-amber-200/70'
                  }`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-600">Dispatched:</span>
                      <span className="font-bold tabular-nums text-slate-900">
                        {item.alreadyDispatched} / {item.effectiveQty} {unit}
                      </span>
                    </div>

                    {/* Compact Progress Bar */}
                    <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          done ? 'bg-emerald-500' : hasPlans ? 'bg-blue-500' : 'bg-amber-400'
                        }`}
                        style={{ width: `${pctDispatched}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Pending:</span>
                      <span className={`font-bold tabular-nums ${item.remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {item.remaining} {unit} ({pctDispatched}%)
                      </span>
                    </div>
                  </div>

                  {/* Vertical Divider */}
                  <div className="hidden xl:block w-px self-stretch bg-slate-200/70 my-0.5" />

                  {/* Right Column: Actions (Plan Dispatch / Skip Done + Plans Toggle) */}
                  <div className="flex flex-col sm:flex-row xl:flex-col items-end justify-center gap-1.5 shrink-0 xl:w-36">
                    {done ? (
                      <button
                        type="button"
                        onClick={() => openDispatch(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors w-full justify-center"
                      >
                        <CheckCircle2 size={13} className="text-emerald-600" />
                        Skip Done
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openDispatch(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 shadow-2xs transition-all active:scale-95 w-full justify-center"
                      >
                        <Plus size={13} />
                        Plan Dispatch
                      </button>
                    )}

                    {hasPlans && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.item_id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-primary transition-colors py-0.5 px-1"
                      >
                        {isExpanded ? (
                          <><ChevronUp size={12} /> Hide plans</>
                        ) : (
                          <><ChevronDown size={12} /> {item.activePlans.length} plan{item.activePlans.length !== 1 ? 's' : ''}</>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Dispatch Plans Sub-table */}
                {isExpanded && hasPlans && (
                  <div className="bg-slate-50/70 border-t border-slate-200/70 px-4 py-3">
                    <div className="text-[11px] font-semibold text-slate-600 mb-2 uppercase tracking-wider flex items-center gap-1">
                      <Truck size={13} className="text-slate-400" /> Associated Dispatch Plans
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50/90 text-slate-500 uppercase tracking-wide border-b border-slate-200/70">
                            <th className="text-left py-2 px-3 font-semibold">Dispatch No.</th>
                            <th className="text-center py-2 px-3 font-semibold">Qty</th>
                            <th className="text-left py-2 px-3 font-semibold">Date</th>
                            <th className="text-left py-2 px-3 font-semibold">Godown</th>
                            <th className="text-center py-2 px-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {item.activePlans.map(plan => {
                            const godown = godowns.find(g => g.godown_id === plan.godown_id);
                            return (
                              <tr key={plan.plan_id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-2 px-3 font-semibold text-slate-800">
                                  {plan.dispatch_number || '—'}
                                </td>
                                <td className="py-2 px-3 text-center font-bold text-slate-800 tabular-nums">
                                  {plan.quantity}
                                </td>
                                <td className="py-2 px-3 text-slate-600">
                                  {plan.dispatch_date ? format(new Date(plan.dispatch_date), 'dd/MM/yyyy') : '—'}
                                </td>
                                <td className="py-2 px-3 text-slate-600 font-medium">
                                  {godown?.name || '—'}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <StatusBadge status={plan.dispatch_status} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  /* ─── Render Table View ─────────────────────────────────── */
  const renderTable = () => (
    <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
          <tr>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order No.</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ordered</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatched</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Remaining</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {filteredItems.length === 0 ? (
            <tr>
              <td colSpan="9" className="p-12 text-center text-slate-400">
                <Truck size={32} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium">No skip delivered items found.</p>
              </td>
            </tr>
          ) : (
            currentItems.map(item => {
              const hasPlans = item.activePlans.length > 0;
              const done     = item.remaining <= 0;
              const status   = !hasPlans ? 'Pending' : done ? 'Skip Done' : 'Partially Dispatched';
              return (
                <tr key={item.item_id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">{item.sales_orders?.order_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {item.sales_orders?.order_date ? format(new Date(item.sales_orders.order_date), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-medium">{item.sales_orders?.customers?.name || '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {item.products?.name || '—'}
                    <span className="text-slate-400 text-[10px] ml-1 uppercase">({item.products?.unit || 'Kg'})</span>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums font-semibold text-slate-700">{item.effectiveQty}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-semibold text-blue-600">{item.alreadyDispatched}</td>
                  <td className="px-4 py-3 text-center tabular-nums font-bold text-amber-600">{item.remaining}</td>
                  <td className="px-4 py-3 text-center whitespace-nowrap"><StatusBadge status={status} /></td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openDispatch(item)}
                      className="px-2.5 py-1 text-xs font-semibold rounded-md bg-primary text-white hover:bg-primary/90 shadow-2xs"
                    >
                      {done ? 'View' : 'Plan'}
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0">
        {/* Sub-header Bar: Legend, Count & View Mode Switcher */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex-wrap gap-2 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-medium text-slate-700">
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
            </span>
            <div className="hidden sm:flex items-center gap-3 text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Skip Done</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Partially Dispatched</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Pending</span>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => handleViewModeChange('card')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 text-xs font-medium ${
                viewMode === 'card' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Card View"
            >
              <LayoutGrid size={13} />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('table')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 text-xs font-medium ${
                viewMode === 'table' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Table View"
            >
              <LayoutList size={13} />
              <span>Table</span>
            </button>
          </div>
        </div>

        {viewMode === 'card' ? renderCards() : renderTable()}

        {filteredItems.length > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredItems.length}
            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)}
            onPageChange={setCurrentPage}
            className="border-t border-slate-200 shrink-0 bg-slate-50/50"
          />
        )}
      </div>

      <SkipDeliverModal isOpen={dispatchModalOpen} onClose={closeDispatch}
        item={dispatchItem} customers={customers} products={products}
        godowns={godowns} user={user} onSave={handleSaved} />
    </>
  );
};

export default SkipDeliveredTable;
