import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, Plus, Package, Truck, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAllOrderItemsForDispatch } from '../../../services/salesService';
import Pagination from '@/components/ui/pagination';
import PlanDispatchModal from './PlanDispatchModal';

const ITEMS_PER_PAGE = 10;

/* ─── tiny status badge ──────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const map = {
    Pending:                'bg-slate-100 text-slate-500 border-slate-200',
    Planned:                'bg-blue-50 text-blue-700 border-blue-100',
    'Dispatch Done':        'bg-emerald-50 text-emerald-700 border-emerald-100',
    'Partially Dispatched': 'bg-amber-50 text-amber-700 border-amber-100',
    Cancelled:              'bg-red-50 text-red-400 border-red-100',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${map[status] || map.Pending}`}>
      {status}
    </span>
  );
};

/* ─── quantity pill ──────────────────────────────────────── */
const QtyPill = ({ value, color, label }) => {
  const colors = {
    blue:    'bg-blue-50 text-blue-700 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    violet:  'bg-violet-50 text-violet-700 border-violet-100',
    amber:   'bg-amber-50 text-amber-700 border-amber-100',
    slate:   'bg-slate-100 text-slate-500 border-slate-200',
  };
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg border px-2.5 py-1.5 min-w-[56px] ${colors[color] || colors.slate}`}>
      <span className="text-base font-bold tabular-nums leading-tight">{value}</span>
      <span className="text-[9px] font-medium uppercase tracking-wide opacity-70 leading-tight mt-0.5">{label}</span>
    </div>
  );
};

/* ─── progress bar ───────────────────────────────────────── */
const ProgressBar = ({ ordered, planned, dispatched }) => {
  if (!ordered) return null;
  const plannedPct    = Math.min((planned / ordered) * 100, 100);
  const dispatchedPct = Math.min((dispatched / ordered) * 100, 100);
  return (
    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mt-2">
      <div
        className="h-full bg-violet-400 float-left rounded-l-full"
        style={{ width: `${dispatchedPct}%` }}
      />
      <div
        className="h-full bg-emerald-300 float-left"
        style={{ width: `${Math.max(plannedPct - dispatchedPct, 0)}%` }}
      />
    </div>
  );
};

/* ──────────────────────────────────────────────────────────
   Main component
────────────────────────────────────────────────────────── */
const DispatchPlanningTable = ({ godowns, searchTerm, dispatchFilter, onSave, user }) => {
  const [items, setItems]                   = useState([]);
  const [loading, setLoading]               = useState(true);
  const [currentPage, setCurrentPage]       = useState(1);
  const [expandedItems, setExpandedItems]   = useState(new Set());
  const [modalItem, setModalItem]           = useState(null);

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await getAllOrderItemsForDispatch();
      setItems(data);
    } catch {
      toast.error('Failed to load dispatch items');
    }
    setLoading(false);
  };

  /* ── toggle expand ────────────────────────────────────── */
  const toggleExpand = (itemId) =>
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });

  /* ── computed per-item quantities ─────────────────────── */
  const withQty = useMemo(() =>
    items
      .filter(item => item.sales_orders?.process_type !== 'skip_delivered')
      .map(item => {
        const activePlans     = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
        const cancelledQty    = Number(item.cancelled_quantity || 0);
        const effectiveQty    = Number(item.quantity) - cancelledQty;
        const totalPlanned    = activePlans.reduce((s, p) => s + Number(p.quantity), 0);
        const totalDispatched = activePlans.reduce((s, p) => s + Number(p.already_dispatched || 0), 0);
        const remaining       = effectiveQty - totalPlanned;
        return { ...item, activePlans, cancelledQty, effectiveQty, totalPlanned, totalDispatched, remaining };
      }),
    [items],
  );

  /* ── filter ───────────────────────────────────────────── */
  const filteredItems = useMemo(() => {
    const term = searchTerm?.toLowerCase() || '';
    return withQty
      .filter(item => {
        if (!term) return true;
        return (
          item.sales_orders?.order_number?.toLowerCase().includes(term) ||
          item.sales_orders?.customers?.name?.toLowerCase().includes(term) ||
          item.products?.name?.toLowerCase().includes(term)
        );
      })
      .filter(item => {
        if (dispatchFilter === 'pending')  return item.activePlans.length === 0;
        if (dispatchFilter === 'history')  return item.activePlans.length > 0;
        return true;
      });
  }, [withQty, searchTerm, dispatchFilter]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, dispatchFilter]);

  const totalPages   = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, currentPage]);

  /* ── modal open/close ─────────────────────────────────── */
  const openModal = (item) => setModalItem(item);
  const closeModal = () => setModalItem(null);

  const handleSaved = () => {
    loadItems();
    onSave?.();
    closeModal();
  };

  /* ── loading ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading dispatch items...</p>
      </div>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <ClipboardList size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Dispatch Items</h3>
        <p className="text-sm text-slate-400">
          {searchTerm
            ? 'No items match your search.'
            : dispatchFilter === 'pending'
            ? 'All items have been planned.'
            : dispatchFilter === 'history'
            ? 'No planned dispatches yet.'
            : 'Create an order to start planning dispatches.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">

        {/* ── legend ── */}
        <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-200 inline-block" />Ordered</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-300 inline-block" />Planned</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-300 inline-block" />Dispatched</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300 inline-block" />Remaining</span>
          <span className="ml-auto font-medium text-slate-500">
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── item cards ── */}
        <div className="divide-y divide-slate-100">
          {currentItems.map(item => {
            const isExpanded   = expandedItems.has(item.item_id);
            const fullyPlanned = item.remaining <= 0;
            const hasPlans     = item.activePlans.length > 0;

            return (
              <div key={item.item_id} className="group">

                {/* ─ main row ─ */}
                <div className="flex items-start gap-4 px-4 py-4 hover:bg-slate-50 transition-colors">

                  {/* Left: order + product info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">
                        {item.sales_orders?.order_number || '—'}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-sm text-slate-600">
                        {item.products?.name}
                        <span className="text-xs text-slate-400 ml-1 uppercase">({item.products?.unit})</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-500">
                        {item.sales_orders?.customers?.name || '—'}
                      </span>
                      {item.sales_orders?.order_date && (
                        <>
                          <span className="text-slate-200 text-xs">·</span>
                          <span className="text-xs text-slate-400">
                            {format(new Date(item.sales_orders.order_date), 'dd/MM/yyyy')}
                          </span>
                        </>
                      )}
                      {item.cancelledQty > 0 && (
                        <span className="text-[10px] text-red-400 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                          {item.cancelledQty} cancelled
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <ProgressBar
                      ordered={item.effectiveQty}
                      planned={item.totalPlanned}
                      dispatched={item.totalDispatched}
                    />
                  </div>

                  {/* Centre: quantity pills */}
                  <div className="flex items-center gap-2 shrink-0">
                    <QtyPill value={item.effectiveQty}    color="blue"    label="Ordered" />
                    <QtyPill value={item.totalPlanned}    color="emerald" label="Planned" />
                    <QtyPill value={item.totalDispatched} color="violet"  label="Dispatched" />
                    <QtyPill
                      value={item.remaining}
                      color={item.remaining > 0 ? 'amber' : 'slate'}
                      label="Remaining"
                    />
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {/* Plan / Edit button — always clickable */}
                    {fullyPlanned ? (
                      <button
                        type="button"
                        onClick={() => openModal(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 transition-colors"
                      >
                        <CheckCircle2 size={13} /> Fully Planned
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openModal(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 shadow-sm transition-all hover:shadow-md active:scale-95"
                      >
                        <Plus size={13} />
                        Plan Dispatch
                        <span className="ml-0.5 bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                          {item.remaining} left
                        </span>
                      </button>
                    )}

                    {/* Toggle existing plans */}
                    {hasPlans && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.item_id)}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
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

                {/* ─ expanded: existing plans sub-table ─ */}
                {isExpanded && hasPlans && (
                  <div className="bg-slate-50 border-t border-slate-100 px-4 pb-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 uppercase tracking-wide">
                          <th className="text-left py-2 pr-4 font-semibold">Dispatch No.</th>
                          <th className="text-center py-2 pr-4 font-semibold">Planned Qty</th>
                          <th className="text-center py-2 pr-4 font-semibold">Dispatched</th>
                          <th className="text-left py-2 pr-4 font-semibold">Date</th>
                          <th className="text-left py-2 pr-4 font-semibold">Godown</th>
                          <th className="text-left py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {item.activePlans.map(plan => {
                          const godown = godowns.find(g => g.godown_id === plan.godown_id);
                          return (
                            <tr key={plan.plan_id} className="hover:bg-white transition-colors">
                              <td className="py-2 pr-4 font-semibold text-slate-700">
                                {plan.dispatch_number || '—'}
                              </td>
                              <td className="py-2 pr-4 text-center font-medium text-slate-700">
                                {plan.quantity}
                              </td>
                              <td className="py-2 pr-4 text-center">
                                {plan.already_dispatched > 0 ? (
                                  <span className="text-violet-600 font-medium">{plan.already_dispatched}</span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              <td className="py-2 pr-4 text-slate-500">
                                {plan.dispatch_date
                                  ? format(new Date(plan.dispatch_date), 'dd/MM/yyyy')
                                  : '—'}
                              </td>
                              <td className="py-2 pr-4 text-slate-600">
                                {godown?.name || '—'}
                              </td>
                              <td className="py-2">
                                <StatusBadge status={plan.dispatch_status} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Edit nudge */}
                    {item.activePlans.some(p => p.dispatch_status === 'Pending' || p.dispatch_status === 'Planned') && (
                      <p className="text-[10px] text-slate-400 mt-2 text-right">
                        Tip: click <strong>Plan Dispatch</strong> to edit pending plans or add a new partial plan.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── pagination ── */}
        {filteredItems.length > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredItems.length}
            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)}
            onPageChange={setCurrentPage}
            className="border-t border-slate-200"
          />
        )}
      </div>

      {/* ── Plan Dispatch Modal ── */}
      <PlanDispatchModal
        isOpen={!!modalItem}
        onClose={closeModal}
        item={modalItem}
        godowns={godowns}
        user={user}
        onSave={handleSaved}
      />
    </>
  );
};

export default DispatchPlanningTable;
