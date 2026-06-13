import { useState, useEffect, useMemo } from 'react';
import {
  Search, ShoppingCart, ChevronDown, ChevronUp, Truck,
  Package, CheckCircle2, AlertCircle, Hash,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getApprovedItemsForDelivery, getDeliveriesForItem } from '../../../services/purchaseService';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';
import ReceiveModal from './ReceiveModal';

const ITEMS_PER_PAGE = 10;

/* ─── status badge ──────────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const map = {
    Pending:   'bg-slate-100 text-slate-500 border-slate-200',
    Partial:   'bg-blue-50 text-blue-700 border-blue-100',
    Completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${map[status] || map.Pending}`}>
      {status}
    </span>
  );
};

/* ─── quantity pill ────────────────────────────────────────── */
const QtyPill = ({ value, color, label }) => {
  const colors = {
    blue:    'bg-blue-50 text-blue-700 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
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

/* ─── progress bar ─────────────────────────────────────────── */
const ProgressBar = ({ ordered, received }) => {
  if (!ordered) return null;
  const receivedPct = Math.min((received / ordered) * 100, 100);
  return (
    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mt-2">
      <div
        className="h-full bg-emerald-400 float-left rounded-l-full"
        style={{ width: `${receivedPct}%` }}
      />
    </div>
  );
};

/* ────────────────────────────────────────────────────────────
   Main component
───────────────────────────────────────────────────────────── */
const DeliveryTable = ({ transporters, user, godowns }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [deliveryHistory, setDeliveryHistory] = useState({});
  const [loadingHistory, setLoadingHistory] = useState(new Set());
  const [receiveItem, setReceiveItem] = useState(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getApprovedItemsForDelivery();
      setItems(data);
    } catch {
      toast.error('Failed to load approved items');
      setItems([]);
    }
    setLoading(false);
  };

  const toggleExpand = async (itemId) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });

    if (!expandedItems.has(itemId) && !deliveryHistory[itemId]) {
      setLoadingHistory(prev => new Set(prev).add(itemId));
      try {
        const history = await getDeliveriesForItem(itemId);
        setDeliveryHistory(prev => ({ ...prev, [itemId]: history }));
      } catch {
        toast.error('Failed to load delivery history');
      }
      setLoadingHistory(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return items.filter(item => {
      if (!term) return true;
      const indent = item.purchase_indents || {};
      return (
        indent.indent_number?.toLowerCase().includes(term) ||
        item.products?.name?.toLowerCase().includes(term) ||
        indent.vendors?.name?.toLowerCase().includes(term)
      );
    });
  }, [items, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, currentPage]);

  const handleDeliverySaved = () => {
    const savedItemId = receiveItem?.item_id;
    setReceiveItem(null);
    if (savedItemId) {
      setDeliveryHistory(prev => {
        const next = { ...prev };
        delete next[savedItemId];
        return next;
      });
    }
    loadData();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading delivery items...</p>
      </div>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <ShoppingCart size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Deliveries Pending</h3>
        <p className="text-sm text-slate-400">
          {searchTerm
            ? 'No items match your search criteria.'
            : 'No approved items found. Approve items in Vendor Approval to see them here.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
          <input type="text" placeholder="Search indent no., product, vendor..."
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground"
          />
        </div>
        <span className="text-xs text-slate-400 font-medium">{filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* ── legend ── */}
        <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-300 inline-block" />Ordered</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-300 inline-block" />Received</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300 inline-block" />Remaining</span>
          <span className="ml-auto font-medium text-slate-500">
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── item cards ── */}
        <div className="divide-y divide-slate-100">
          {currentItems.map(item => {
            const indent = item.purchase_indents || {};
            const isExpanded = expandedItems.has(item.item_id);
            const isCompleted = item.delivery_status === 'Completed';
            const history = deliveryHistory[item.item_id] || [];
            const isLoadingHistory = loadingHistory.has(item.item_id);
            const hasHistory = history.length > 0 || isLoadingHistory;

            return (
              <div key={item.item_id} className="group">

                {/* ─ main row ─ */}
                <div
                  className={`flex items-start gap-4 px-4 py-4 hover:bg-slate-50 transition-colors cursor-pointer ${isCompleted ? 'bg-green-50/30' : ''}`}
                  onClick={() => toggleExpand(item.item_id)}
                >

                  {/* Left: indent + product info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={item.delivery_status} />
                      <span className="font-semibold text-slate-800 text-sm">
                        {indent.indent_number || '—'}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-sm text-slate-600">
                        {item.products?.name}
                        <span className="text-xs text-slate-400 ml-1 uppercase">({item.products?.unit})</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-500">
                        {item.item_vendor?.name || indent.vendors?.name || '—'}
                      </span>
                      {indent.godowns?.name && (
                        <>
                          <span className="text-slate-200 text-xs">·</span>
                          <span className="text-xs text-slate-400">{indent.godowns?.name}</span>
                        </>
                      )}
                    </div>

                    {/* Progress bar */}
                    <ProgressBar ordered={item.quantity} received={item.received_qty} />
                  </div>

                  {/* Centre: quantity pills */}
                  <div className="flex items-center gap-2 shrink-0">
                    <QtyPill value={item.quantity}      color="blue"    label="Ordered" />
                    <QtyPill value={item.received_qty}  color="emerald" label="Received" />
                    <QtyPill
                      value={item.remaining_qty}
                      color={item.remaining_qty > 0 ? 'amber' : 'slate'}
                      label="Remaining"
                    />
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {!isCompleted ? (
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); setReceiveItem(item); }}
                        className="gap-1.5 text-xs h-8">
                        <Truck size={13} />
                        Receive
                      </Button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <CheckCircle2 size={13} /> Done
                      </span>
                    )}

                    {isLoadingHistory ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-primary" />
                        Loading lifts...
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleExpand(item.item_id); }}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {isExpanded ? (
                          <><ChevronUp size={12} /> Lifts</>
                        ) : (
                          <><ChevronDown size={12} /> Lifts</>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* ─ expanded: delivery history sub-table ─ */}
                {isExpanded && hasHistory && (
                  <div className="bg-slate-50 border-t border-slate-100 px-4 pb-3">
                    {isLoadingHistory ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary" />
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 uppercase tracking-wide">
                            <th className="text-left py-2 pr-4 font-semibold">Lift No.</th>
                            <th className="text-left py-2 pr-4 font-semibold">Date</th>
                            <th className="text-left py-2 pr-4 font-semibold">Transporter</th>
                            <th className="text-left py-2 pr-4 font-semibold">LR No.</th>
                            <th className="text-left py-2 pr-4 font-semibold">Vehicle</th>
                            <th className="text-center py-2 pr-4 font-semibold">Qty</th>
                            <th className="text-left py-2 pr-4 font-semibold">Godown</th>
                            <th className="text-center py-2 pr-4 font-semibold">Status</th>
                            <th className="text-left py-2 font-semibold">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {history.map(del => (
                            <tr key={del.delivery_id} className="hover:bg-white transition-colors">
                              <td className="py-2 pr-4 font-semibold text-teal-700 whitespace-nowrap">
                                {del.lifting_number || '—'}
                              </td>
                              <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">
                                {format(new Date(del.delivery_date), 'dd/MM/yyyy')}
                              </td>
                              <td className="py-2 pr-4 text-slate-600">
                                {del.transporters?.name || '—'}
                              </td>
                              <td className="py-2 pr-4 text-slate-500">
                                {del.lr_number || '—'}
                              </td>
                              <td className="py-2 pr-4 text-slate-500">
                                {del.vehicle_number || '—'}
                              </td>
                              <td className="py-2 pr-4 text-center font-medium text-slate-700">
                                {del.received_quantity}
                              </td>
                              <td className="py-2 pr-4 text-slate-500 max-w-[140px]">
                                {del.purchase_delivery_godowns?.length > 0 ? (
                                  <span className="flex flex-wrap gap-1">
                                    {del.purchase_delivery_godowns.map(g => (
                                      <span key={g.godown_id} className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-white border border-slate-200 text-[10px]">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-300 inline-block" />
                                        {g.godowns?.name || '—'} ({g.qty})
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-2 pr-4 text-center">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                                  del.status === 'Received'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                    : 'bg-amber-50 text-amber-700 border-amber-100'
                                }`}>
                                  {del.status === 'Received' ? <CheckCircle2 size={10} /> : null}
                                  {del.status || 'Received'}
                                </span>
                              </td>
                              <td className="py-2 text-slate-400 max-w-[120px] truncate" title={del.remarks || ''}>
                                {del.remarks || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

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

      {receiveItem && (
        <ReceiveModal
          isOpen={!!receiveItem}
          onClose={() => setReceiveItem(null)}
          item={receiveItem}
          transporters={transporters}
          godowns={godowns}
          user={user}
          onSuccess={handleDeliverySaved}
        />
      )}
    </>
  );
};

export default DeliveryTable;
