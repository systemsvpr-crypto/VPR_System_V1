import { useState, useEffect, useMemo } from 'react';
import { PackageOpen, Clock, Search, Zap, ArrowRightLeft, Loader2, ChevronLeft, ChevronRight, Trash2, LayoutGrid, LayoutList, Calendar, Check, CheckCircle2, Truck, User, MapPin, FileText, Package, RotateCw, ChevronDown, ChevronUp, Save, Phone, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAawakDeliveries, updateAawakLift, deleteDelivery } from '../../../services/purchaseService';
import { getGroupNameFromItem } from '../../../services/productGroupingService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FilterMenu from '@/components/FilterMenu';

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
  const [godownFilter, setGodownFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedLifts, setSelectedLifts] = useState(new Set());
  const [editingRows, setEditingRows] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [savingLiftId, setSavingLiftId] = useState(null);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('purchase_view_mode') || 'card');

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('purchase_view_mode', mode);
  };

  const isHistory = activeSubTab === 'history';

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, dateFilter, productFilter, transporterFilter, expDateFilter, godownFilter, activeSubTab, pageSize]);

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

      const vName = d.purchase_indent_items?.approved_vendor?.name || d.purchase_indent_items?.item_vendor?.name || '';

      const editGodown = editingRows[d.delivery_id]?.godown_id;
      const currentAlloc = d.purchase_delivery_godowns?.[0]?.godown_id;
      const resolvedGodownId = editGodown !== undefined ? editGodown : (currentAlloc && currentAlloc !== d.transporter_id ? currentAlloc : (d.purchase_indent_items?.approved_godown_id || ''));
      const matchGodown = !godownFilter || String(resolvedGodownId) === String(godownFilter);

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
        vName.toLowerCase().includes(term) ||
        iNum.toLowerCase().includes(term) ||
        liftNum.toLowerCase().includes(term) ||
        lrNum.toLowerCase().includes(term) ||
        driverNum.toLowerCase().includes(term) ||
        vehicleNum.toLowerCase().includes(term);

      return matchDate && matchProduct && matchTransporter && matchExpDate && matchGodown && matchSearch;
    });
  }, [activeDeliveriesList, dateFilter, productFilter, transporterFilter, expDateFilter, godownFilter, searchTerm, groups, editingRows]);

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
    if (field === 'expected_delivery_date') return del.expected_delivery_date ? del.expected_delivery_date.slice(0, 10) : '';
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

  // The *first* time a field is changed on a row while multiple rows are
  // checked, it fills in every other checked row too — a convenience for
  // updating a batch of lifts the same way in one go. But once any row in
  // that selection already has its own override for this field (i.e. the
  // batch has already been filled, or someone changed one row individually),
  // further changes only apply to the one row being edited — so a row can be
  // corrected on its own afterwards without dragging the rest of the
  // selection along with it. Same convention as Vendor Approval/Indent's
  // setFieldForSelected.
  const setRowValForSelection = (delId, field, val) => {
    if (!selectedLifts.has(delId)) {
      setRowVal(delId, field, val);
      return;
    }
    setEditingRows(prev => {
      const alreadyDiverged = Array.from(selectedLifts).some(id => prev[id]?.[field] !== undefined);
      const next = { ...prev };
      if (alreadyDiverged) {
        next[delId] = { ...(next[delId] || {}), [field]: val };
      } else {
        selectedLifts.forEach(id => {
          next[id] = { ...(next[id] || {}), [field]: val };
        });
      }
      return next;
    });
  };

  const handleStatusChange = (delId, val) => setRowValForSelection(delId, 'status', val);
  const handleExpDateChange = (delId, val) => setRowValForSelection(delId, 'expected_delivery_date', val);

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
          expected_delivery_date: edit.expected_delivery_date,
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

  const handleQuickSaveLift = async (del) => {
    const deliveryId = del.delivery_id;
    const edit = editingRows[deliveryId] || {};
    let dbStatus = edit.status;
    if (dbStatus === 'AT TPT GDN') dbStatus = 'In Transport Godown';

    const editedQty = edit.received_quantity !== undefined ? Number(edit.received_quantity) : Number(getRowVal(del, 'received_quantity') || 0);
    if (!editedQty || editedQty <= 0) {
      toast.error(`${del.lifting_number || 'Lift'}: enter a valid Qty.`);
      return;
    }

    setSavingLiftId(deliveryId);
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
        expected_delivery_date: edit.expected_delivery_date !== undefined ? edit.expected_delivery_date : (del.expected_delivery_date || null),
      });
      toast.success(`${del.lifting_number || 'Lift'} updated successfully`);
      setEditingRows(prev => {
        const next = { ...prev };
        delete next[deliveryId];
        return next;
      });
      toggleExpandLift(deliveryId);
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error(`${del.lifting_number || 'Lift'}: ${err.message || 'Failed to save changes'}`);
    } finally {
      setSavingLiftId(null);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDateFilter('');
    setProductFilter('');
    setTransporterFilter('');
    setExpDateFilter('');
    setGodownFilter('');
  };

  const renderCards = () => (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 custom-scrollbar bg-slate-50/50">
      {filteredDeliveries.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <PackageOpen size={36} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium">
            {activeSubTab === 'pending' ? 'No pending lifts found.' : 'No arrived lifts found.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {currentDeliveries.map(del => {
            const isSelected = selectedLifts.has(del.delivery_id);
            const prod = del.purchase_indent_items?.products || {};
            const locked = isRowLocked(del);
            const uiStatus = getRowVal(del, 'status');
            const indent = del.purchase_indent_items?.purchase_indents || {};
            const vendorName = del.purchase_indent_items?.approved_vendor?.name || del.purchase_indent_items?.item_vendor?.name || '';
            const transporterName = del.transporters?.name || '';

            // Godown display value resolved from dropdown selection
            const godownId = getRowVal(del, 'godown_id');
            const selectedGodown = ownGodowns.find(g => String(g.godown_id) === String(godownId)) || godowns.find(g => String(g.godown_id) === String(godownId));
            const godownDisplayName = selectedGodown?.name || del.purchase_indent_items?.approved_godown?.name || del.purchase_delivery_godowns?.[0]?.godowns?.name || '—';

            // Vehicle, LR, Driver & Remarks (only show if non-empty and not '—')
            const vehicleNum = getRowVal(del, 'vehicle_number');
            const hasVehicle = Boolean(vehicleNum && String(vehicleNum).trim() !== '' && String(vehicleNum).trim() !== '—');
            const lrNum = getRowVal(del, 'lr_number');
            const hasLr = Boolean(lrNum && String(lrNum).trim() !== '' && String(lrNum).trim() !== '—');
            const driverNum = getRowVal(del, 'driver_phone_number');
            const hasDriver = Boolean(driverNum && String(driverNum).trim() !== '' && String(driverNum).trim() !== '—');
            const remarksVal = getRowVal(del, 'remarks');
            const hasRemarks = Boolean(remarksVal && String(remarksVal).trim() !== '' && String(remarksVal).trim() !== '—');

            // Quantities calculation
            const masterUnit = (prod.unit || '').toLowerCase();
            const isBagUnit = masterUnit.includes('bag') || (del.dispatch_qty_bag != null && Number(del.dispatch_qty_bag) > 0);
            const unitLabel = isBagUnit ? 'Bags' : (prod.unit || 'Kg');
            const dispatchQty = isBagUnit
              ? (del.dispatch_qty_bag != null ? Number(Number(del.dispatch_qty_bag).toFixed(2)) : (del.dispatch_qty_kg != null ? Number(Number(del.dispatch_qty_kg).toFixed(2)) : 0))
              : (del.dispatch_qty_kg != null ? Number(Number(del.dispatch_qty_kg).toFixed(2)) : (del.dispatch_qty_bag != null ? Number(Number(del.dispatch_qty_bag).toFixed(2)) : 0));
            const recvQty = Number(getRowVal(del, 'received_quantity') || 0);
            const percentReceived = dispatchQty > 0 ? Math.min(100, Math.round((recvQty / dispatchQty) * 100)) : (recvQty > 0 ? 100 : 0);

            // Packaging spec display
            const pkgSize = prod.packaging_size || del.purchase_indent_items?.packaging_size;
            const pkgSizeDisplay = pkgSize ? `${pkgSize} Kg` : (prod.unit || '');

            const isReceived = uiStatus === 'Received' || uiStatus === 'Arrived';
            const isInTransit = uiStatus === 'In Transit';

            const accentBorder = isReceived
              ? 'border-l-[3.5px] border-l-emerald-500'
              : isInTransit
                ? 'border-l-[3.5px] border-l-blue-500'
                : 'border-l-[3.5px] border-l-amber-500';

            return (
              <div
                key={del.delivery_id}
                className={`bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col ${accentBorder} ${isSelected ? 'ring-2 ring-primary/20 border-primary' : ''
                  }`}
              >
                {/* Main Compact 1-Card Row */}
                <div className="py-2.5 px-3.5 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
                  {/* Left Column: Status Badge, LIFT Number, Date */}
                  <div className="flex items-center gap-2.5 shrink-0 min-w-[155px]">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(del.delivery_id)}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5"
                    />
                    <div className="flex flex-col gap-1">
                      <div>
                        {isReceived ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 leading-none">
                            <Check size={11} className="stroke-[3]" /> Received
                          </span>
                        ) : isInTransit ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 leading-none">
                            <RotateCw size={10} className="stroke-[2.5]" /> In Transit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 leading-none">
                            <Clock size={10} className="stroke-[2.5]" /> {uiStatus === 'AT TPT GDN' ? 'AT TPT GDN' : 'Expected'}
                          </span>
                        )}
                      </div>
                      <div className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight">
                        {del.lifting_number || '—'}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium whitespace-nowrap leading-none">
                        <Calendar size={11} className="text-slate-400 shrink-0" />
                        <span>Exp Delivery: {del.expected_delivery_date ? format(new Date(del.expected_delivery_date), 'dd MMM yyyy') : '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vertical Divider */}
                  <div className="hidden xl:block w-px self-stretch bg-slate-200/70 my-0.5" />

                  {/* Middle Column: Product Avatar, Name, Packaging, Metadata */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
                        {prod.image_url ? (
                          <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                            <Package size={18} className="text-slate-400" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm truncate" title={prod.name}>
                            {prod.name || '—'}
                          </span>
                          {indent.process_type && (
                            <IndentTypeBadge processType={indent.process_type} />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium leading-tight">
                          {pkgSizeDisplay}
                        </div>
                      </div>
                    </div>

                    {/* Metadata Row: Vendor, Transporter, Godown, [Vehicle], [LR No] */}
                    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px]">
                      <div className="flex items-center gap-1 text-slate-600">
                        <User size={12} className="text-slate-400 shrink-0" />
                        <span className="text-slate-400">Vendor:</span>
                        <span className="font-medium text-slate-700 truncate max-w-[130px]" title={vendorName}>{vendorName || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-600">
                        <Truck size={12} className="text-slate-400 shrink-0" />
                        <span className="text-slate-400">Transporter:</span>
                        <span className="font-medium text-slate-700 truncate max-w-[130px]" title={transporterName}>{transporterName || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-600">
                        <MapPin size={12} className="text-slate-400 shrink-0" />
                        <span className="text-slate-400">Godown:</span>
                        <span className="font-semibold text-slate-800 truncate max-w-[130px]" title={godownDisplayName}>{godownDisplayName}</span>
                      </div>
                      {hasVehicle && (
                        <div className="flex items-center gap-1 text-slate-600">
                          <Truck size={12} className="text-slate-400 shrink-0" />
                          <span className="text-slate-400">Vehicle:</span>
                          <span className="font-medium text-slate-700">{vehicleNum}</span>
                        </div>
                      )}
                      {hasLr && (
                        <div className="flex items-center gap-1 text-slate-600">
                          <FileText size={12} className="text-slate-400 shrink-0" />
                          <span className="text-slate-400">LR No:</span>
                          <span className="font-medium text-slate-700">{lrNum}</span>
                        </div>
                      )}
                      {hasDriver && (
                        <div className="flex items-center gap-1 text-slate-600">
                          <Phone size={12} className="text-slate-400 shrink-0" />
                          <span className="text-slate-400">Driver:</span>
                          <span className="font-medium text-slate-700">{driverNum}</span>
                        </div>
                      )}
                      {hasRemarks && (
                        <div className="flex items-center gap-1 text-slate-600">
                          <MessageSquare size={12} className="text-slate-400 shrink-0" />
                          <span className="text-slate-400">Remarks:</span>
                          <span className="font-medium text-slate-700 truncate max-w-[130px]" title={remarksVal}>{remarksVal}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Middle-Right: Quantities Box with Progress Bar */}
                  <div className={`py-1.5 px-3 rounded-lg border flex flex-col justify-between gap-1.5 min-w-[200px] shrink-0 ${isReceived
                    ? 'bg-emerald-50/50 border-emerald-200/70'
                    : isInTransit
                      ? 'bg-blue-50/50 border-blue-200/70'
                      : 'bg-amber-50/50 border-amber-200/70'
                    }`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-md bg-white/90 border border-slate-200/60 flex items-center justify-center shrink-0 shadow-2xs">
                          <Package size={11} className={isReceived ? 'text-emerald-600' : isInTransit ? 'text-blue-600' : 'text-amber-600'} />
                        </div>
                        <span className="font-bold text-slate-900 text-xs">
                          {recvQty} / {dispatchQty} {unitLabel}
                        </span>
                      </div>
                      <span className={`text-[10px] font-semibold ${isReceived ? 'text-emerald-700' : (recvQty === 0 ? 'text-amber-700' : 'text-blue-700')
                        }`}>
                        {recvQty === 0 ? 'Not received yet' : (percentReceived >= 100 ? '100% received' : `${percentReceived}% received`)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${isReceived ? 'bg-emerald-500' : isInTransit ? 'bg-blue-500' : 'bg-amber-500'
                          }`}
                        style={{ width: `${Math.min(100, Math.max(0, percentReceived))}%` }}
                      />
                    </div>

                    {/* Dispatch Qty / Recv Qty sub row */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <div>
                        <span>Disp:</span>
                        <span className="ml-1 font-semibold text-slate-800">{dispatchQty}</span>
                      </div>
                      <div>
                        <span>Recv:</span>
                        <span className="ml-1 font-bold text-emerald-700">{recvQty}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Delete Action */}
                  <div className="flex items-center justify-end xl:justify-center gap-1.5 shrink-0">
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

                {/* Form Controls / Inputs Section - Always visible in one view, enabled when checked */}
                <div className={`p-3 border-t transition-colors ${isSelected ? 'bg-primary/[0.02] border-primary/20' : 'bg-slate-50/60 border-slate-100'
                  }`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Status</label>
                      <select
                        disabled={!isSelected || locked}
                        value={uiStatus}
                        onChange={e => handleStatusChange(del.delivery_id, e.target.value)}
                        className="w-full h-8 text-xs font-semibold px-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100/80 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        <option value="In Transit">In Transit</option>
                        <option value="AT TPT GDN">AT TPT GDN</option>
                        <option value="Arrived">Arrived</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                        Recv. Qty ({unitLabel})
                      </label>
                      {locked ? (
                        <div className="h-8 px-2.5 flex items-center text-xs font-bold text-emerald-700 bg-slate-100 border border-slate-200 rounded-lg">
                          {getRowVal(del, 'received_quantity') || '—'}
                        </div>
                      ) : (
                        <Input
                          type="number"
                          step="any"
                          disabled={!isSelected}
                          value={getRowVal(del, 'received_quantity')}
                          onChange={e => setRowValForSelection(del.delivery_id, 'received_quantity', e.target.value)}
                          placeholder="Recv Qty"
                          className="h-8 text-xs font-bold text-emerald-700 bg-white disabled:bg-slate-100/80 disabled:text-slate-400 disabled:cursor-not-allowed"
                        />
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Godown (Destination)</label>
                      <select
                        disabled={!isSelected || locked}
                        value={getRowVal(del, 'godown_id')}
                        onChange={e => setRowValForSelection(del.delivery_id, 'godown_id', e.target.value)}
                        className="w-full h-8 text-xs px-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100/80 disabled:text-slate-400 disabled:cursor-not-allowed"
                      >
                        <option value="">Select godown...</option>
                        {ownGodowns.map(g => (
                          <option key={g.godown_id} value={g.godown_id}>{g.name}</option>
                        ))}
                      </select>
                    </div>

                    {isSelected && (
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Exp. Delivery Date</label>
                        {locked ? (
                          <div className="h-8 px-2.5 flex items-center text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded-lg">
                            {del.expected_delivery_date ? format(new Date(del.expected_delivery_date), 'dd/MM/yyyy') : '—'}
                          </div>
                        ) : (
                          <input
                            type="date"
                            value={getRowVal(del, 'expected_delivery_date')}
                            onChange={e => handleExpDateChange(del.delivery_id, e.target.value)}
                            className="w-full text-slate-700 text-xs border border-slate-200 rounded-lg px-2 h-8 focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                          />
                        )}
                      </div>
                    )}

                    {(isSelected || hasVehicle) && (
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Vehicle No.</label>
                        <Input
                          type="text"
                          placeholder="Vehicle Number"
                          disabled={!isSelected || locked}
                          value={getRowVal(del, 'vehicle_number')}
                          onChange={e => setRowValForSelection(del.delivery_id, 'vehicle_number', e.target.value)}
                          className="h-8 text-xs bg-white disabled:bg-slate-100/80 disabled:text-slate-400 disabled:cursor-not-allowed"
                        />
                      </div>
                    )}

                    {(isSelected || hasLr) && (
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">LR Number</label>
                        <Input
                          type="text"
                          placeholder="LR Number"
                          disabled={!isSelected || locked}
                          value={getRowVal(del, 'lr_number')}
                          onChange={e => setRowValForSelection(del.delivery_id, 'lr_number', e.target.value)}
                          className="h-8 text-xs bg-white disabled:bg-slate-100/80 disabled:text-slate-400 disabled:cursor-not-allowed"
                        />
                      </div>
                    )}

                    {(isSelected || hasDriver) && (
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Driver Contact</label>
                        <Input
                          type="text"
                          placeholder="Driver Phone"
                          disabled={!isSelected || locked}
                          value={getRowVal(del, 'driver_phone_number')}
                          onChange={e => setRowValForSelection(del.delivery_id, 'driver_phone_number', e.target.value)}
                          className="h-8 text-xs bg-white disabled:bg-slate-100/80 disabled:text-slate-400 disabled:cursor-not-allowed"
                        />
                      </div>
                    )}

                    {(isSelected || hasRemarks) && (
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Remarks</label>
                        <Input
                          type="text"
                          placeholder="Remarks..."
                          disabled={!isSelected || locked}
                          value={getRowVal(del, 'remarks')}
                          onChange={e => setRowValForSelection(del.delivery_id, 'remarks', e.target.value)}
                          className="h-8 text-xs bg-white disabled:bg-slate-100/80 disabled:text-slate-400 disabled:cursor-not-allowed"
                        />
                      </div>
                    )}
                  </div>

                  {/* Selection Status & Quick Save Footer */}
                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-200/60">
                    <div className="flex items-center gap-1.5">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                          <Check size={12} className="stroke-[3]" /> Editing enabled (batch saves on Submit)
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                        </span>
                      )}
                    </div>

                    {isSelected && !locked && (
                      <Button
                        size="sm"
                        type="button"
                        disabled={savingLiftId === del.delivery_id}
                        onClick={() => handleQuickSaveLift(del)}
                        className="h-7 px-2.5 text-xs bg-primary hover:bg-primary/90 text-white font-medium gap-1 shadow-2xs"
                      >
                        {savingLiftId === del.delivery_id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Save size={12} />
                        )}
                        Quick Save
                      </Button>
                    )}
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
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${activeSubTab === 'pending'
              ? 'bg-primary/10 text-primary'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
          >
            <Clock size={14} />
            Pending
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeSubTab === 'pending' ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-500'
              }`}>
              {pendingDeliveries.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveSubTab('history'); setCurrentPage(1); setSelectedLifts(new Set()); setEditingRows({}); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${activeSubTab === 'history'
              ? 'bg-primary/10 text-primary'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
          >
            <PackageOpen size={14} />
            History
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeSubTab === 'history' ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-500'
              }`}>
              {historyDeliveries.length}
            </span>
          </button>
        </div>

        <div className="relative w-full sm:flex-1 sm:min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
          <Input
            type="text"
            placeholder="Search product, lift, vendor, LR no..."
            className="pl-9 h-9 text-xs w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <FilterMenu
          activeCount={[dateFilter, productFilter, transporterFilter, godownFilter, expDateFilter].filter(Boolean).length}
          onClear={() => { setDateFilter(''); setProductFilter(''); setTransporterFilter(''); setGodownFilter(''); setExpDateFilter(''); }}
        >
          {/* Calendar Filter for Delivery Date */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 h-9 rounded-md border border-slate-200 text-xs text-slate-600 shadow-sm focus-within:ring-2 focus-within:ring-primary/30 w-full">
            <span className="whitespace-nowrap font-medium text-slate-500">Date:</span>
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="h-7 text-xs bg-transparent flex-1 min-w-0 focus:outline-none text-slate-700 cursor-pointer"
            />
          </div>

          <select
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full"
          >
            <option value="">Product (-- All --)</option>
            {productOptions.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            value={transporterFilter}
            onChange={e => setTransporterFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full"
          >
            <option value="">Transporter (-- All --)</option>
            {transporterOptions.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            value={godownFilter}
            onChange={e => setGodownFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full"
          >
            <option value="">Godown (-- All --)</option>
            {ownGodowns.map(g => (
              <option key={g.godown_id} value={String(g.godown_id)}>{g.name}</option>
            ))}
          </select>

          {/* Calendar Filter for Expected Receiving Date */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 h-9 rounded-md border border-slate-200 text-xs text-slate-600 shadow-sm focus-within:ring-2 focus-within:ring-primary/30 w-full">
            <span className="whitespace-nowrap font-medium text-slate-500">Exp. Recv Date:</span>
            <input
              type="date"
              value={expDateFilter}
              onChange={e => setExpDateFilter(e.target.value)}
              className="h-7 text-xs bg-transparent flex-1 min-w-0 focus:outline-none text-slate-700 cursor-pointer"
            />
          </div>
        </FilterMenu>

        {(searchTerm || dateFilter || productFilter || transporterFilter || godownFilter || expDateFilter) && (
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
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${viewMode === 'card'
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
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all ${viewMode === 'table'
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
                    <td colSpan="16" className="p-12 text-center text-slate-400">
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
                      <td className="px-3 py-3 text-center">
                        {locked ? (
                          <span className="text-slate-500 whitespace-nowrap">{del.expected_delivery_date ? format(new Date(del.expected_delivery_date), 'dd/MM/yyyy') : '—'}</span>
                        ) : (
                          <Input
                            type="date"
                            value={getRowVal(del, 'expected_delivery_date')}
                            onChange={e => handleExpDateChange(del.delivery_id, e.target.value)}
                            className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white"
                          />
                        )}
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

