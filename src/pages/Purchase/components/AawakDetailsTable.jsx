import { useState, useEffect, useMemo } from 'react';
import { PackageOpen, Clock, Search, Zap, ArrowRightLeft, Loader2, ChevronLeft, ChevronRight, Trash2, LayoutGrid, LayoutList } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAawakDeliveries, updateAawakLift, deleteDelivery } from '../../../services/purchaseService';
import { getGroupNameFromItem } from '../../../services/productGroupingService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// A lift is only truly finalized (fully locked) once Arrived/Received — that's
// when its stock has landed in the real destination godown for good.
const isRowLocked = (del) => del?.status === 'Arrived' || del?.status === 'Received';

const IndentTypeBadge = ({ processType }) => (
  processType === 'direct' ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-medium bg-amber-50 text-amber-700 border border-amber-100">
      <Zap size={10} /> Direct
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-medium bg-blue-50 text-blue-700 border border-blue-100">
      <ArrowRightLeft size={10} /> Process
    </span>
  )
);

const AawakDetailsTable = ({ transporters = [], user, godowns = [], products = [], vendors = [], groups = [] }) => {
  const [activeSubTab, setActiveSubTab] = useState('pending'); // 'pending' ('In Transit') | 'history' ('AT TPT GDN', 'Arrived' & 'Received')
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [transporterFilter, setTransporterFilter] = useState('');
  const [expDateFilter, setExpDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedLifts, setSelectedLifts] = useState(new Set());
  const [editingRows, setEditingRows] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('purchase_view_mode') || 'card');

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('purchase_view_mode', mode);
  };

  const isHistory = activeSubTab === 'history';

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, dateFilter, productFilter, transporterFilter, expDateFilter, activeSubTab, pageSize]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch all deliveries for Aawak Details
      const data = await getAawakDeliveries();
      setDeliveries(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load aawak deliveries');
      setDeliveries([]);
    }
    setLoading(false);
  };

  // Pipeline division: Pending = 'In Transit' only (stock not yet recorded).
  // History = 'In Transport Godown' (AT TPT GDN), 'Arrived' & 'Received' — once a
  // lift's stock is tracked (even just at the transporter's own godown), it's out
  // of Pending. Rows here stay editable until Arrived/Received locks them for good.
  const pendingDeliveries = useMemo(() => {
    return deliveries.filter(d => d.status === 'In Transit');
  }, [deliveries]);

  const historyDeliveries = useMemo(() => {
    return deliveries.filter(d => d.status === 'In Transport Godown' || d.status === 'AT TPT GDN' || d.status === 'Arrived' || d.status === 'Received');
  }, [deliveries]);

  const activeDeliveriesList = isHistory ? historyDeliveries : pendingDeliveries;

  const productOptions = useMemo(() => {
    const map = new Map();
    activeDeliveriesList.forEach(d => {
      const p = d.purchase_indent_items?.products;
      if (p?.name) map.set(p.name, p.name);
    });
    return Array.from(map.values());
  }, [activeDeliveriesList]);

  const transporterOptions = useMemo(() => {
    const map = new Map();
    activeDeliveriesList.forEach(d => {
      const name = d.transporters?.name;
      if (name) map.set(name, name);
    });
    return Array.from(map.values());
  }, [activeDeliveriesList]);

  // Only real (Own) godowns are valid final destinations — Transporter-type
  // godowns are just stock-tracking placeholders used while "AT TPT GDN."
  const ownGodowns = useMemo(() =>
    godowns.filter(g => g.is_active && (g.godown_type || 'Own') === 'Own'),
    [godowns],
  );

  const filteredDeliveries = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return activeDeliveriesList.filter(d => {
      const dYmd = d.delivery_date ? d.delivery_date.slice(0, 10) : '';
      const expYmd = d.expected_delivery_date ? d.expected_delivery_date.slice(0, 10) : '';

      const matchDate = !dateFilter || dYmd === dateFilter;
      const matchExpDate = !expDateFilter || expYmd === expDateFilter;

      const pName = d.purchase_indent_items?.products?.name || '';
      const matchProduct = !productFilter || pName === productFilter;
      const tName = d.transporters?.name || '';
      const matchTransporter = !transporterFilter || tName === transporterFilter;

      const iNum = d.purchase_indent_items?.purchase_indents?.indent_number || '';
      const liftNum = d.lifting_number || '';
      const lrNum = d.lr_number || '';
      const driverNum = d.driver_phone_number || d.transporters?.driver_phone_number || '';
      const vehicleNum = d.vehicle_number || d.transporters?.vehicle_number || '';
      const gName = getGroupNameFromItem(d, groups) || getGroupNameFromItem(d.purchase_indent_items, groups);
      const matchSearch = !term ||
        pName.toLowerCase().includes(term) ||
        (gName && gName !== '—' && gName.toLowerCase().includes(term)) ||
        tName.toLowerCase().includes(term) ||
        iNum.toLowerCase().includes(term) ||
        liftNum.toLowerCase().includes(term) ||
        lrNum.toLowerCase().includes(term) ||
        driverNum.toLowerCase().includes(term) ||
        vehicleNum.toLowerCase().includes(term);

      return matchDate && matchProduct && matchTransporter && matchExpDate && matchSearch;
    });
  }, [activeDeliveriesList, dateFilter, productFilter, transporterFilter, expDateFilter, searchTerm, groups]);

  const totalPages = Math.max(1, Math.ceil(filteredDeliveries.length / pageSize));
  const currentDeliveries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDeliveries.slice(start, start + pageSize);
  }, [filteredDeliveries, currentPage, pageSize]);

  const getRowVal = (del, field) => {
    const edit = editingRows[del.delivery_id];
    if (edit && edit[field] !== undefined) return edit[field];
    if (field === 'status') return del.status === 'In Transport Godown' ? 'AT TPT GDN' : del.status || '';
    if (field === 'godown_id') {
      const currentAlloc = del.purchase_delivery_godowns?.[0]?.godown_id;
      // While "AT TPT GDN," the allocation points at the transporter's own
      // godown — not a valid destination pick — so fall back to the indent's
      // originally-approved godown as the default final destination instead.
      if (currentAlloc && currentAlloc !== del.transporter_id) return currentAlloc;
      return del.purchase_indent_items?.approved_godown_id || '';
    }
    if (field === 'driver_phone_number') return del.driver_phone_number || del.transporters?.driver_phone_number || '';
    if (field === 'vehicle_number') return del.vehicle_number || del.transporters?.vehicle_number || '';
    // received_quantity defaults to what was actually dispatched
    // (dispatch_qty_bag/kg, matching the product's master unit) rather
    // than starting blank/zero — it's still 0 at this point for a lift
    // that's just "In Transit" and hasn't been confirmed as received yet.
    if (field === 'received_quantity') {
      if (del.received_quantity) return String(del.received_quantity);
      const masterUnit = (del.purchase_indent_items?.products?.unit || '').toLowerCase();
      const dispatchQty = masterUnit === 'kg' ? del.dispatch_qty_kg : del.dispatch_qty_bag;
      return dispatchQty != null ? String(dispatchQty) : '';
    }
    return del[field] || '';
  };

  const setRowVal = (deliveryId, field, val) => {
    setEditingRows(prev => ({
      ...prev,
      [deliveryId]: { ...prev[deliveryId], [field]: val },
    }));
  };

  // The *first* time Status is changed while multiple rows are checked, it
  // fills in every other checked row too — a convenience for updating a
  // batch of lifts the same way in one go. But once any row in that
  // selection already has its own status override (i.e. the batch has
  // already been filled, or someone changed one row individually), further
  // changes only apply to the one row being edited — so a row can be
  // corrected on its own afterwards without dragging the rest of the
  // selection along with it. Same convention as Vendor Approval/Indent's
  // setFieldForSelected.
  const handleStatusChange = (delId, val) => {
    if (!selectedLifts.has(delId)) {
      setRowVal(delId, 'status', val);
      return;
    }
    setEditingRows(prev => {
      const alreadyDiverged = Array.from(selectedLifts).some(id => prev[id]?.status !== undefined);
      const next = { ...prev };
      if (alreadyDiverged) {
        next[delId] = { ...(next[delId] || {}), status: val };
      } else {
        selectedLifts.forEach(id => {
          next[id] = { ...(next[id] || {}), status: val };
        });
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedLifts.size === 0) return;

    setSubmitting(true);
    const selectedIds = Array.from(selectedLifts);
    let successCount = 0;
    // Only a lift that actually submits drops out of selection/edits — one
    // that fails (e.g. a save error) stays checked with its edits untouched,
    // so the user just fixes the problem and retries instead of redoing it.
    const savedIds = new Set();

    for (const deliveryId of selectedIds) {
      const del = deliveries.find(d => String(d.delivery_id) === String(deliveryId));
      if (!del) continue;
      const edit = editingRows[deliveryId] || {};

      let dbStatus = edit.status;
      if (dbStatus === 'AT TPT GDN') dbStatus = 'In Transport Godown';

      const editedQty = edit.received_quantity !== undefined ? Number(edit.received_quantity) : Number(getRowVal(del, 'received_quantity') || 0);
      if (!editedQty || editedQty <= 0) {
        toast.error(`${del.lifting_number || 'Lift'}: enter a valid Qty.`);
        continue;
      }

      try {
        await updateAawakLift({
          delivery_id: del.delivery_id,
          user_id: user?.user_id,
          status: dbStatus !== undefined ? dbStatus : (del.status === 'AT TPT GDN' ? 'In Transport Godown' : del.status),
          lr_number: edit.lr_number !== undefined ? edit.lr_number : (del.lr_number || ''),
          driver_phone_number: edit.driver_phone_number !== undefined ? edit.driver_phone_number : (del.driver_phone_number || del.transporters?.driver_phone_number || ''),
          vehicle_number: edit.vehicle_number !== undefined ? edit.vehicle_number : (del.vehicle_number || del.transporters?.vehicle_number || ''),
          remarks: edit.remarks !== undefined ? edit.remarks : (del.remarks || ''),
          godown_id: getRowVal(del, 'godown_id') || null,
          received_quantity: editedQty,
          transporter_id: del.transporter_id || null,
        });
        successCount++;
        savedIds.add(deliveryId);
      } catch (err) {
        console.error(err);
        toast.error(`${del.lifting_number || 'Lift'}: ${err.message || 'Failed to submit changes'}`);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} lift${successCount !== 1 ? 's' : ''} updated successfully`);
      setEditingRows(prev => { const next = { ...prev }; savedIds.forEach(id => { delete next[id]; }); return next; });
      setSelectedLifts(prev => { const next = new Set(prev); savedIds.forEach(id => next.delete(id)); return next; });
      await loadData();
    }
    setSubmitting(false);
  };

  const toggleSelect = (deliveryId) => {
    setSelectedLifts(prev => {
      const next = new Set(prev);
      if (next.has(deliveryId)) next.delete(deliveryId);
      else next.add(deliveryId);
      return next;
    });
  };

  const allSelected = currentDeliveries.length > 0 && currentDeliveries.every(d => selectedLifts.has(d.delivery_id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedLifts(prev => {
        const next = new Set(prev);
        currentDeliveries.forEach(d => next.delete(d.delivery_id));
        return next;
      });
    } else {
      setSelectedLifts(prev => {
        const next = new Set(prev);
        currentDeliveries.forEach(d => next.add(d.delivery_id));
        return next;
      });
    }
  };

  const handleDeleteDelivery = async (del) => {
    const liftNum = del.lifting_number || del.delivery_id;
    if (!window.confirm(`Permanently delete delivery lift "${liftNum}"? This cannot be undone.`)) return;
    try {
      await deleteDelivery(del.delivery_id);
      toast.success('Delivery lift deleted');
      setDeliveries(prev => prev.filter(d => d.delivery_id !== del.delivery_id));
      setSelectedLifts(prev => {
        const next = new Set(prev);
        next.delete(del.delivery_id);
        return next;
      });
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete delivery');
    }
  };

  const handleDeleteSelected = async () => {
    const toDeleteIds = Array.from(selectedLifts);
    if (toDeleteIds.length === 0) return;

    if (!window.confirm(`Permanently delete ${toDeleteIds.length} selected delivery lift(s)? This will revert inventory transactions and cannot be undone.`)) {
      return;
    }

    setDeletingSelected(true);
    let success = 0;
    for (const id of toDeleteIds) {
      try {
        await deleteDelivery(id);
        success++;
      } catch (err) {
        console.error('Failed to delete delivery', id, err);
      }
    }
    setDeletingSelected(false);
    if (success > 0) {
      toast.success(`Successfully deleted ${success} delivery lift(s)`);
      setSelectedLifts(new Set());
      loadData();
    } else {
      toast.error('Failed to delete selected deliveries');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDateFilter('');
    setProductFilter('');
    setTransporterFilter('');
    setExpDateFilter('');
  };

  const renderCards = () => (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50">
      {filteredDeliveries.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <PackageOpen size={36} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium">
            {activeSubTab === 'pending' ? 'No pending lifts found.' : 'No arrived lifts found.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-4">
          {currentDeliveries.map(del => {
            const isSelected = selectedLifts.has(del.delivery_id);
            const prod = del.purchase_indent_items?.products || {};
            const locked = isRowLocked(del);
            const uiStatus = getRowVal(del, 'status');
            const indent = del.purchase_indent_items?.purchase_indents || {};
            const vendorName = del.purchase_indent_items?.approved_vendor?.name || del.purchase_indent_items?.item_vendor?.name || '';

            return (
              <div
                key={del.delivery_id}
                className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 transition-all ${
                  isSelected ? 'ring-2 ring-primary/20 border-primary' : 'hover:border-slate-300 hover:shadow-md'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(del.delivery_id)}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{del.lifting_number || '—'}</span>
                        <IndentTypeBadge processType={indent.process_type} />
                        {(getGroupNameFromItem(del, groups) !== '—' || getGroupNameFromItem(del.purchase_indent_items, groups) !== '—') && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {getGroupNameFromItem(del, groups) !== '—' ? getGroupNameFromItem(del, groups) : getGroupNameFromItem(del.purchase_indent_items, groups)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {prod.name || '—'} <span className="uppercase text-[10px] text-slate-400">({prod.unit || '—'})</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select
                      disabled={locked}
                      value={uiStatus}
                      onChange={e => handleStatusChange(del.delivery_id, e.target.value)}
                      className="h-6 text-[11px] font-semibold px-2 rounded border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                    >
                      <option value="In Transit">In Transit</option>
                      <option value="AT TPT GDN">AT TPT GDN</option>
                      <option value="Arrived">Arrived</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      title="Delete Lift"
                      onClick={() => handleDeleteDelivery(del)}
                      className="p-1 h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>

                {/* 2-Column Key-Value Grid */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                  <div>
                    <span className="text-slate-400">Indent No:</span>{' '}
                    <span className="text-slate-700 font-medium">{indent.indent_number || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Date:</span>{' '}
                    <span className="text-slate-700">{del.delivery_date ? format(new Date(del.delivery_date), 'dd/MM/yyyy') : '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Vendor:</span>{' '}
                    <span className="text-slate-700 font-medium truncate inline-block max-w-[120px] align-bottom" title={vendorName}>{vendorName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Transporter:</span>{' '}
                    <span className="text-slate-700 truncate inline-block max-w-[120px] align-bottom" title={del.transporters?.name}>{del.transporters?.name || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Exp. Recv:</span>{' '}
                    <span className="text-slate-700">{del.expected_delivery_date ? format(new Date(del.expected_delivery_date), 'dd/MM/yyyy') : '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Dispatch Kg:</span>{' '}
                    <span className="text-slate-700 font-semibold">{del.dispatch_qty_kg != null ? Number(Number(del.dispatch_qty_kg).toFixed(2)) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Dispatch Bag:</span>{' '}
                    <span className="text-slate-700 font-semibold">{del.dispatch_qty_bag != null ? Number(Number(del.dispatch_qty_bag).toFixed(2)) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Recv Qty:</span>{' '}
                    <span className="text-emerald-700 font-bold">{getRowVal(del, 'received_quantity') || '—'}</span>
                  </div>
                </div>

                {/* Form Controls / Inputs Section */}
                <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-6 sm:col-span-4">
                      <label className="text-[10px] text-slate-400 block mb-0.5">Recv. Qty</label>
                      {locked ? (
                        <div className="h-8 px-2 flex items-center text-xs font-bold text-emerald-700 bg-slate-50 border border-slate-200 rounded">
                          {getRowVal(del, 'received_quantity') || '—'}
                        </div>
                      ) : (
                        <Input
                          type="number"
                          step="any"
                          disabled={locked}
                          value={getRowVal(del, 'received_quantity')}
                          onChange={e => setRowVal(del.delivery_id, 'received_quantity', e.target.value)}
                          placeholder="Recv Qty"
                          className="h-8 text-xs font-bold text-emerald-700"
                        />
                      )}
                    </div>
                    <div className="col-span-6 sm:col-span-4">
                      <label className="text-[10px] text-slate-400 block mb-0.5">Godown</label>
                      <select
                        disabled={locked}
                        value={getRowVal(del, 'godown_id')}
                        onChange={e => setRowVal(del.delivery_id, 'godown_id', e.target.value)}
                        className="w-full h-8 text-xs px-2 rounded border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        <option value="">Select godown...</option>
                        {ownGodowns.map(g => (
                          <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-4">
                      <label className="text-[10px] text-slate-400 block mb-0.5">LR Number</label>
                      <Input
                        type="text"
                        placeholder="LR No."
                        disabled={locked}
                        value={getRowVal(del, 'lr_number')}
                        onChange={e => setRowVal(del.delivery_id, 'lr_number', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-6 sm:col-span-4">
                      <label className="text-[10px] text-slate-400 block mb-0.5">Vehicle No.</label>
                      <Input
                        type="text"
                        placeholder="Vehicle No."
                        disabled={locked}
                        value={getRowVal(del, 'vehicle_number')}
                        onChange={e => setRowVal(del.delivery_id, 'vehicle_number', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-4">
                      <label className="text-[10px] text-slate-400 block mb-0.5">Driver Contact</label>
                      <Input
                        type="text"
                        placeholder="Driver Phone"
                        disabled={locked}
                        value={getRowVal(del, 'driver_phone_number')}
                        onChange={e => setRowVal(del.delivery_id, 'driver_phone_number', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-4">
                      <label className="text-[10px] text-slate-400 block mb-0.5">Remarks</label>
                      <Input
                        type="text"
                        placeholder="Remarks..."
                        disabled={locked}
                        value={getRowVal(del, 'remarks')}
                        onChange={e => setRowVal(del.delivery_id, 'remarks', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading aawak dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 font-sans flex-1 min-h-0">
      {/* Everything in one wrapping row: Pending/History toggle + search +
          filters + item count + Submit. */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => { setActiveSubTab('pending'); setCurrentPage(1); setSelectedLifts(new Set()); setEditingRows({}); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeSubTab === 'pending'
                ? 'bg-primary/10 text-primary'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Clock size={14} />
            Pending
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeSubTab === 'pending' ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-500'
            }`}>
              {pendingDeliveries.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveSubTab('history'); setCurrentPage(1); setSelectedLifts(new Set()); setEditingRows({}); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              activeSubTab === 'history'
                ? 'bg-primary/10 text-primary'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <PackageOpen size={14} />
            History
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeSubTab === 'history' ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-500'
            }`}>
              {historyDeliveries.length}
            </span>
          </button>
        </div>

        <div className="relative w-full sm:flex-1 sm:min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
          <Input
            type="text"
            placeholder="Search product, transporter, LR..."
            className="pl-9 h-9 text-xs w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Calendar Filter for Delivery Date */}
        <div className="flex items-center gap-1.5 bg-white px-2.5 h-9 rounded-md border border-slate-200 text-xs text-slate-600 shadow-sm focus-within:ring-2 focus-within:ring-primary/30 shrink-0">
          <span className="whitespace-nowrap font-medium text-slate-500">Date:</span>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="h-7 text-xs bg-transparent focus:outline-none text-slate-700 cursor-pointer"
          />
        </div>

        <select
          value={productFilter}
          onChange={e => setProductFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[150px] shrink-0"
        >
          <option value="">Product Name (-- All --)</option>
          {productOptions.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          value={transporterFilter}
          onChange={e => setTransporterFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[150px] shrink-0"
        >
          <option value="">Transporter Name (-- All --)</option>
          {transporterOptions.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Calendar Filter for Expected Receiving Date */}
        <div className="flex items-center gap-1.5 bg-white px-2.5 h-9 rounded-md border border-slate-200 text-xs text-slate-600 shadow-sm focus-within:ring-2 focus-within:ring-primary/30 shrink-0">
          <span className="whitespace-nowrap font-medium text-slate-500">Exp. Recv Date:</span>
          <input
            type="date"
            value={expDateFilter}
            onChange={e => setExpDateFilter(e.target.value)}
            className="h-7 text-xs bg-transparent focus:outline-none text-slate-700 cursor-pointer"
          />
        </div>

        {(searchTerm || dateFilter || productFilter || transporterFilter || expDateFilter) && (
          <Button variant="outline" size="sm" onClick={clearFilters} className="h-9 text-xs border-slate-200 hover:bg-slate-50 shrink-0">
            Clear
          </Button>
        )}

        <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
          {/* View Mode Switcher */}
          <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-50 shrink-0">
            <button
              type="button"
              onClick={() => handleViewModeChange('card')}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
                viewMode === 'card'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Card View"
            >
              <LayoutGrid size={14} />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('table')}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Table View"
            >
              <LayoutList size={14} />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>

          <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
            {filteredDeliveries.length} item{filteredDeliveries.length !== 1 ? 's' : ''}
          </span>

          {selectedLifts.size > 0 && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={deletingSelected}
              className="h-9 px-3 text-xs bg-red-600 hover:bg-red-700 text-white font-medium gap-1.5 shadow-sm shrink-0 animate-in fade-in"
            >
              {deletingSelected ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              Delete Selected ({selectedLifts.size})
            </Button>
          )}

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || selectedLifts.size === 0}
            className="h-9 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm disabled:opacity-50 transition-all flex items-center gap-1.5 shrink-0"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </div>

      {/* Main Table - Modern Rounded-XL Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0">
        {/* ── Sub-header bar with Select All Checkbox & Count (same as Sales Dispatch Planning) ── */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex-wrap shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600">
              {filteredDeliveries.length} item{filteredDeliveries.length !== 1 ? 's' : ''}
            </span>
            {selectedLifts.size > 0 && (
              <span className="text-primary font-semibold">({selectedLifts.size} selected)</span>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              disabled={currentDeliveries.length === 0}
              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span>Select All</span>
          </label>
        </div>

        {viewMode === 'card' ? renderCards() : (
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0">
            <table className="w-full text-xs">
              <thead className="bg-blue-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="w-16 px-2 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        disabled={currentDeliveries.length === 0}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">Action</span>
                    </div>
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Lifting No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent Type</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Group Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Qty (KG)</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Qty (Bags)</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Transporter</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[110px]">LR No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[140px]">Driver No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[110px]">Vehicle No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Exp. Recv. Date</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Recv. Qty</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[140px]">Godown Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px]">Review</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDeliveries.length === 0 && (
                  <tr>
                    <td colSpan="17" className="p-12 text-center text-slate-400">
                      <PackageOpen size={36} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-medium">
                        {activeSubTab === 'pending' ? 'No pending lifts found.' : 'No arrived lifts found.'}
                      </p>
                    </td>
                  </tr>
                )}
                {currentDeliveries.map(del => {
                  const isSelected = selectedLifts.has(del.delivery_id);
                  const prod = del.purchase_indent_items?.products || {};
                  const locked = isRowLocked(del);

                  const uiStatus = getRowVal(del, 'status');

                  return (
                    <tr key={del.delivery_id} className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                      <td className="px-2 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(del.delivery_id)}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            title="Delete Lift"
                            onClick={() => handleDeleteDelivery(del)}
                            className="p-1 h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-800 font-semibold whitespace-nowrap">{del.lifting_number || '—'}</td>
                      <td className="px-3 py-3 text-center whitespace-nowrap text-slate-500 text-xs">
                        {del.delivery_date ? format(new Date(del.delivery_date), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <IndentTypeBadge processType={del.purchase_indent_items?.purchase_indents?.process_type} />
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {getGroupNameFromItem(del, groups) !== '—' ? getGroupNameFromItem(del, groups) : getGroupNameFromItem(del.purchase_indent_items, groups)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-slate-800 whitespace-nowrap">
                        {prod.name || '—'}
                        <span className="text-slate-500 ml-1">({prod.unit || '—'})</span>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-700 whitespace-nowrap">
                        {del.dispatch_qty_kg != null ? Number(Number(del.dispatch_qty_kg).toFixed(2)) : '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-700 whitespace-nowrap">
                        {del.dispatch_qty_bag != null ? Number(Number(del.dispatch_qty_bag).toFixed(2)) : '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-700 font-medium whitespace-nowrap">
                        {del.transporters?.name || '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Input
                          type="text"
                          placeholder="LR No."
                          disabled={locked}
                          value={getRowVal(del, 'lr_number')}
                          onChange={e => setRowVal(del.delivery_id, 'lr_number', e.target.value)}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-3 text-center min-w-[140px]">
                        <Input
                          type="text"
                          placeholder="Driver No."
                          disabled={locked}
                          value={getRowVal(del, 'driver_phone_number')}
                          onChange={e => setRowVal(del.delivery_id, 'driver_phone_number', e.target.value)}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Input
                          type="text"
                          placeholder="Vehicle No."
                          disabled={locked}
                          value={getRowVal(del, 'vehicle_number')}
                          onChange={e => setRowVal(del.delivery_id, 'vehicle_number', e.target.value)}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-3 text-center text-slate-500 whitespace-nowrap">
                        {del.expected_delivery_date ? format(new Date(del.expected_delivery_date), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-emerald-700 whitespace-nowrap">
                        {getRowVal(del, 'received_quantity') || '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <select
                          disabled={locked}
                          value={getRowVal(del, 'godown_id')}
                          onChange={e => setRowVal(del.delivery_id, 'godown_id', e.target.value)}
                          className="w-full h-8 text-xs px-2.5 rounded-md border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                        >
                          <option value="">Select godown...</option>
                          {ownGodowns.map(g => (
                            <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Input
                          type="text"
                          placeholder="Review..."
                          disabled={locked}
                          value={getRowVal(del, 'remarks')}
                          onChange={e => setRowVal(del.delivery_id, 'remarks', e.target.value)}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <select
                          disabled={locked}
                          value={uiStatus}
                          onChange={e => handleStatusChange(del.delivery_id, e.target.value)}
                          className="w-full h-8 text-xs font-semibold px-2.5 rounded-md border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                        >
                          <option value="In Transit">In Transit</option>
                          <option value="AT TPT GDN">AT TPT GDN</option>
                          <option value="Arrived">Arrived</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="shrink-0 px-4 py-3 border-t border-slate-100 bg-blue-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:border-primary bg-white font-medium text-xs shadow-sm"
            >
              {PAGE_SIZE_OPTIONS.map((val) => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500 whitespace-nowrap">
              {filteredDeliveries.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, filteredDeliveries.length)} of {filteredDeliveries.length} items
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 border border-slate-300 rounded-md bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center justify-center text-primary"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <span className="text-xs font-semibold text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 border border-slate-300 rounded-md bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center justify-center text-primary"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AawakDetailsTable;

