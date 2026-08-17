import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Clock, History, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAawakDeliveries, updateAawakLift } from '../../../services/purchaseService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Pagination from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 15;

// A lift is only truly finalized (fully locked) once Arrived/Received — that's
// when its stock has landed in the real destination godown for good.
const isRowLocked = (del) => del?.status === 'Arrived' || del?.status === 'Received';

const AawakDetailsTable = ({ transporters = [], user, godowns = [], products = [], vendors = [] }) => {
  const [activeSubTab, setActiveSubTab] = useState('pending'); // 'pending' ('In Transit') | 'history' ('AT TPT GDN', 'Arrived' & 'Received')
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [transporterFilter, setTransporterFilter] = useState('');
  const [expDateFilter, setExpDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLifts, setSelectedLifts] = useState(new Set());
  const [editingRows, setEditingRows] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const isHistory = activeSubTab === 'history';

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, dateFilter, productFilter, transporterFilter, expDateFilter, activeSubTab]);

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
      const matchSearch = !term ||
        pName.toLowerCase().includes(term) ||
        tName.toLowerCase().includes(term) ||
        iNum.toLowerCase().includes(term) ||
        liftNum.toLowerCase().includes(term) ||
        lrNum.toLowerCase().includes(term) ||
        driverNum.toLowerCase().includes(term) ||
        vehicleNum.toLowerCase().includes(term);

      return matchDate && matchProduct && matchTransporter && matchExpDate && matchSearch;
    });
  }, [activeDeliveriesList, dateFilter, productFilter, transporterFilter, expDateFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredDeliveries.length / ITEMS_PER_PAGE));
  const currentDeliveries = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDeliveries.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDeliveries, currentPage]);

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
      return del.purchase_indent_items?.purchase_indents?.godown_id || '';
    }
    if (field === 'driver_phone_number') return del.driver_phone_number || del.transporters?.driver_phone_number || '';
    if (field === 'vehicle_number') return del.vehicle_number || del.transporters?.vehicle_number || '';
    return del[field] || '';
  };

  const setRowVal = (deliveryId, field, val) => {
    setEditingRows(prev => ({
      ...prev,
      [deliveryId]: { ...prev[deliveryId], [field]: val },
    }));
  };

  const handleSubmit = async () => {
    if (selectedLifts.size === 0) return;

    setSubmitting(true);
    try {
      const selectedIds = Array.from(selectedLifts);
      for (const deliveryId of selectedIds) {
        const del = deliveries.find(d => String(d.delivery_id) === String(deliveryId));
        if (!del) continue;
        const edit = editingRows[deliveryId] || {};

        let dbStatus = edit.status;
        if (dbStatus === 'AT TPT GDN') dbStatus = 'In Transport Godown';

        await updateAawakLift({
          delivery_id: del.delivery_id,
          user_id: user?.user_id,
          status: dbStatus !== undefined ? dbStatus : (del.status === 'AT TPT GDN' ? 'In Transport Godown' : del.status),
          lr_number: edit.lr_number !== undefined ? edit.lr_number : (del.lr_number || ''),
          driver_phone_number: edit.driver_phone_number !== undefined ? edit.driver_phone_number : (del.driver_phone_number || del.transporters?.driver_phone_number || ''),
          vehicle_number: edit.vehicle_number !== undefined ? edit.vehicle_number : (del.vehicle_number || del.transporters?.vehicle_number || ''),
          remarks: edit.remarks !== undefined ? edit.remarks : (del.remarks || ''),
          godown_id: getRowVal(del, 'godown_id') || null,
          received_quantity: del.received_quantity,
          transporter_id: del.transporter_id || null,
        });
      }
      toast.success('Changes submitted successfully');
      setEditingRows({});
      setSelectedLifts(new Set());
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to submit changes');
    }
    setSubmitting(false);
  };

  const toggleSelect = (deliveryId) => {
    const del = deliveries.find(d => String(d.delivery_id) === String(deliveryId));
    if (isRowLocked(del)) return;
    setSelectedLifts(prev => {
      const next = new Set(prev);
      if (next.has(deliveryId)) next.delete(deliveryId);
      else next.add(deliveryId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = currentDeliveries.filter(d => !isRowLocked(d));
    if (selectable.length > 0 && selectable.every(d => selectedLifts.has(d.delivery_id))) {
      setSelectedLifts(prev => {
        const next = new Set(prev);
        selectable.forEach(d => next.delete(d.delivery_id));
        return next;
      });
    } else {
      setSelectedLifts(prev => {
        const next = new Set(prev);
        selectable.forEach(d => next.add(d.delivery_id));
        return next;
      });
    }
  };

  const selectableCount = currentDeliveries.filter(d => !isRowLocked(d)).length;
  const allSelected = selectableCount > 0 && currentDeliveries.filter(d => !isRowLocked(d)).every(d => selectedLifts.has(d.delivery_id));

  const clearFilters = () => {
    setSearchTerm('');
    setDateFilter('');
    setProductFilter('');
    setTransporterFilter('');
    setExpDateFilter('');
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading aawak dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Sub-tabs Bar (Pending & History) with Submit button at rightmost position */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setActiveSubTab('pending'); setCurrentPage(1); setSelectedLifts(new Set()); setEditingRows({}); }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-2 ${
              activeSubTab === 'pending'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Clock size={14} />
            <span>Pending</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeSubTab === 'pending' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {pendingDeliveries.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveSubTab('history'); setCurrentPage(1); setSelectedLifts(new Set()); setEditingRows({}); }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-2 ${
              activeSubTab === 'history'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <History size={14} />
            <span>History</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeSubTab === 'history' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {historyDeliveries.length}
            </span>
          </button>
        </div>

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || selectedLifts.size === 0}
          className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm disabled:opacity-50 transition-all flex items-center gap-1.5"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {submitting ? 'Submitting...' : 'Submit'}
        </Button>
      </div>

      {/* Filter Toolbar - Modern layout with Calendar Pickers */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
            <Input
              type="text"
              placeholder="Search product, transporter, LR..."
              className="pl-9 h-9 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Calendar Filter for Delivery Date */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 h-9 rounded-md border border-slate-200 text-xs text-slate-600 shadow-sm focus-within:ring-2 focus-within:ring-primary/30">
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
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[160px]"
          >
            <option value="">Product Name (-- All --)</option>
            {productOptions.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            value={transporterFilter}
            onChange={e => setTransporterFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[160px]"
          >
            <option value="">Transporter Name (-- All --)</option>
            {transporterOptions.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Calendar Filter for Expected Receiving Date */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 h-9 rounded-md border border-slate-200 text-xs text-slate-600 shadow-sm focus-within:ring-2 focus-within:ring-primary/30">
            <span className="whitespace-nowrap font-medium text-slate-500">Exp. Recv Date:</span>
            <input
              type="date"
              value={expDateFilter}
              onChange={e => setExpDateFilter(e.target.value)}
              className="h-7 text-xs bg-transparent focus:outline-none text-slate-700 cursor-pointer"
            />
          </div>

          {(searchTerm || dateFilter || productFilter || transporterFilter || expDateFilter) && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="h-9 text-xs border-slate-200 hover:bg-slate-50">
              Clear
            </Button>
          )}
        </div>

        <span className="text-xs text-slate-400 font-medium shrink-0">
          {filteredDeliveries.length} item{filteredDeliveries.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Main Table - Modern Rounded-XL Container */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {filteredDeliveries.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <ShoppingCart size={36} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium">
              {activeSubTab === 'pending' ? 'No pending lifts found.' : 'No arrived lifts found.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="w-10 px-2 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      disabled={selectableCount === 0}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Transporter</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[110px]">LR No.</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[140px]">Driver No.</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[110px]">Vehicle No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Exp. Recv. Date</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Recv. Qty</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[140px]">Godown Name</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px]">Review</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentDeliveries.map(del => {
                  const isSelected = selectedLifts.has(del.delivery_id);
                  const prod = del.purchase_indent_items?.products || {};
                  const qtyKg = Number(del.received_quantity || 0);
                  const locked = isRowLocked(del);

                  const uiStatus = getRowVal(del, 'status');

                  return (
                    <tr key={del.delivery_id} className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                      <td className="px-2 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(del.delivery_id)}
                          disabled={locked}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-500 text-xs">
                        {del.delivery_date ? format(new Date(del.delivery_date), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-800">
                        {prod.name || '—'}
                      </td>
                      <td className="px-3 py-3 text-slate-700 font-medium whitespace-nowrap">
                        {del.transporters?.name || '—'}
                      </td>
                      <td className="px-3 py-3">
                        <Input
                          type="text"
                          placeholder="LR No."
                          disabled={locked}
                          value={getRowVal(del, 'lr_number')}
                          onChange={e => setRowVal(del.delivery_id, 'lr_number', e.target.value)}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-3 min-w-[140px]">
                        <Input
                          type="text"
                          placeholder="Driver No."
                          disabled={locked}
                          value={getRowVal(del, 'driver_phone_number')}
                          onChange={e => setRowVal(del.delivery_id, 'driver_phone_number', e.target.value)}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-3">
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
                      <td className="px-3 py-3 text-center font-bold text-emerald-700">
                        {qtyKg}
                      </td>
                      <td className="px-3 py-3">
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
                      <td className="px-3 py-3">
                        <Input
                          type="text"
                          placeholder="Review..."
                          disabled={locked}
                          value={getRowVal(del, 'remarks')}
                          onChange={e => setRowVal(del.delivery_id, 'remarks', e.target.value)}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <select
                          disabled={locked}
                          value={uiStatus}
                          onChange={e => setRowVal(del.delivery_id, 'status', e.target.value)}
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

        {filteredDeliveries.length > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredDeliveries.length}
            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredDeliveries.length)}
            onPageChange={setCurrentPage}
            className="border-t border-slate-200"
          />
        )}
      </div>
    </div>
  );
};

export default AawakDetailsTable;
