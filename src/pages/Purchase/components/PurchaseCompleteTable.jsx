import { useState, useEffect, useMemo } from 'react';
import { Search, History, Download, X, Eye, Zap, ArrowRightLeft, BadgeCheck, Truck, Timer, MapPin, CheckCircle2, ChevronLeft, ChevronRight, Trash2, LayoutGrid, LayoutList } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getPurchaseDashboardItems, deleteIndentItem, deleteDelivery } from '../../../services/purchaseService';
import { getGroupNameFromItem } from '../../../services/productGroupingService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalTitle } from '@/components/ui/modal';

const LIFT_STATUS_STYLE = {
  'In Transit': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Timer, label: 'In Transit' },
  'In Transport Godown': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: MapPin, label: 'AT TPT GDN' },
  'AT TPT GDN': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: MapPin, label: 'AT TPT GDN' },
  'Arrived': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2, label: 'Arrived' },
  'Received': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2, label: 'Received' },
};

const formatNum = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const formatMoney = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

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

const PurchaseCompleteTable = ({ user, godowns = [], products = [], vendors = [], groups = [] }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('purchase_view_mode') || 'card');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [transporterFilter, setTransporterFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, dateFilter, productFilter, transporterFilter, pageSize]);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('purchase_view_mode', mode);
  };

  const toggleSelect = (id) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Are you sure you want to delete purchase indent item "${item.product_name}" (Indent: ${item.indent_number}) and all its deliveries?`)) {
      return;
    }
    setDeletingId(item.item_id);
    try {
      await deleteIndentItem(item.item_id);
      toast.success('Purchase item deleted successfully');
      setSelectedItems(prev => {
        const next = new Set(prev);
        next.delete(item.item_id);
        return next;
      });
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to delete purchase item');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteLift = async (deliveryId, liftNo) => {
    if (!window.confirm(`Are you sure you want to delete lift "${liftNo || deliveryId}"?`)) {
      return;
    }
    setDeletingId(deliveryId);
    try {
      await deleteDelivery(deliveryId);
      toast.success('Lift deleted successfully');
      if (selectedItem) {
        const remainingLifts = selectedItem.lifts.filter(l => l.delivery_id !== deliveryId);
        if (remainingLifts.length === 0) {
          setSelectedItem(null);
        } else {
          setSelectedItem({ ...selectedItem, lifts: remainingLifts });
        }
      }
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to delete lift');
    } finally {
      setDeletingId(null);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getPurchaseDashboardItems();
      setItems(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load purchase dashboard');
      setItems([]);
    }
    setLoading(false);
  };

  const productOptions = useMemo(() => {
    const map = new Map();
    items.forEach(i => {
      if (i.product_name && i.product_name !== '—') map.set(i.product_name, i.product_name);
    });
    return Array.from(map.values());
  }, [items]);

  const transporterOptions = useMemo(() => {
    const map = new Map();
    items.forEach(i => {
      i.lifts.forEach(l => {
        if (l.transporter_name && l.transporter_name !== '—') map.set(l.transporter_name, l.transporter_name);
      });
    });
    return Array.from(map.values());
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return items.filter(i => {
      const iYmd = i.indent_date ? String(i.indent_date).slice(0, 10) : '';
      const matchDate = !dateFilter || iYmd === dateFilter;
      const matchProduct = !productFilter || i.product_name === productFilter;
      const matchTransporter = !transporterFilter || i.lifts.some(l => l.transporter_name === transporterFilter);
      const gName = i.group_name || getGroupNameFromItem(i, groups);
      const matchSearch = !term ||
        (i.indent_number || '').toLowerCase().includes(term) ||
        i.vendor_name.toLowerCase().includes(term) ||
        (gName && gName !== '—' && gName.toLowerCase().includes(term)) ||
        i.product_name.toLowerCase().includes(term);

      return matchDate && matchProduct && matchTransporter && matchSearch;
    });
  }, [items, dateFilter, productFilter, transporterFilter, searchTerm, groups]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const clearFilters = () => {
    setSearchTerm('');
    setDateFilter('');
    setProductFilter('');
    setTransporterFilter('');
  };

  const allSelected = currentItems.length > 0 && currentItems.every(i => selectedItems.has(i.item_id));

  const toggleSelectAll = () => {
    const currentItemIds = currentItems.map(i => i.item_id);
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (allSelected) {
        currentItemIds.forEach(id => next.delete(id));
      } else {
        currentItemIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedItems.size} selected purchase item(s) and all their deliveries?`)) {
      return;
    }
    setLoading(true);
    try {
      for (const itemId of selectedItems) {
        await deleteIndentItem(itemId);
      }
      toast.success(`${selectedItems.size} purchase item(s) deleted successfully`);
      setSelectedItems(new Set());
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to delete selected purchase items');
      loadData();
    } finally {
      setLoading(false);
    }
  };

  const renderCards = () => {
    if (filteredItems.length === 0) {
      return (
        <div className="p-12 text-center text-slate-400">
          <BadgeCheck size={36} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium">No purchase indent items found.</p>
        </div>
      );
    }

    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-4">
          {currentItems.map(item => {
            const isSelected = selectedItems.has(item.item_id);
            const hasLifts = item.lifts.length > 0;

            return (
              <div
                key={item.item_id}
                className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 transition-all ${isSelected ? 'ring-2 ring-primary/20 border-primary' : 'hover:border-slate-300 hover:shadow-md'
                  }`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.item_id)}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{item.indent_number || '—'}</span>
                        <IndentTypeBadge processType={item.indent_type === 'Direct' ? 'direct' : 'process'} />
                        {(item.group_name && item.group_name !== '—') && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {item.group_name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {item.product_name} <span className="uppercase text-[10px] text-slate-400">({item.unit || '—'})</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      title="Delete purchase item"
                      disabled={deletingId === item.item_id}
                      onClick={() => handleDeleteItem(item)}
                      className="p-1 h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0 disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>

                {/* 2-Column Key-Value Grid */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                  <div>
                    <span className="text-slate-400">Date:</span>{' '}
                    <span className="text-slate-700">{item.indent_date ? format(new Date(item.indent_date), 'dd/MM/yyyy') : '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Vendor:</span>{' '}
                    <span className="text-slate-700 font-medium truncate inline-block max-w-[120px] align-bottom" title={item.vendor_name}>{item.vendor_name || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Qty:</span>{' '}
                    <span className="text-slate-700 font-semibold">{formatNum(item.total_qty)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Rate:</span>{' '}
                    <span className="text-slate-700 font-medium">₹{formatMoney(item.rate)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Amt:</span>{' '}
                    <span className="text-slate-800 font-bold">₹{formatMoney(item.total_amount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Approve:</span>{' '}
                    <span className="text-slate-700 font-semibold">{item.approve_qty !== null ? formatNum(item.approve_qty) : 'Pending'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">In Transit:</span>{' '}
                    <span className="text-amber-600 font-semibold">{item.intransit_qty > 0 ? formatNum(item.intransit_qty) : '0'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">TPT GDN:</span>{' '}
                    <span className="text-blue-600 font-semibold">{item.transporter_qty > 0 ? formatNum(item.transporter_qty) : '0'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Received:</span>{' '}
                    <span className="text-emerald-700 font-bold">{item.received_qty > 0 ? formatNum(item.received_qty) : '0'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Godown:</span>{' '}
                    <span className="text-slate-700 truncate inline-block max-w-[120px] align-bottom" title={item.received_godown_str}>{item.received_godown_str || '—'}</span>
                  </div>
                </div>

                {/* Footer with Lifts Drilldown */}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-400 truncate max-w-[150px]" title={item.approved_by_name}>
                    {item.approved_by_name ? `Approved: ${item.approved_by_name}` : ''}
                  </span>
                  {hasLifts ? (
                    <button
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Truck size={12} />
                      <span>Lifts ({item.lifts.length})</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400">No lifts yet</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading purchase dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 font-sans flex-1 min-h-0">
      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
            <Input
              type="text"
              placeholder="Search indent no., vendor, product..."
              className="pl-9 h-9 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Calendar Filter for Indent Date */}
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

          {(searchTerm || dateFilter || productFilter || transporterFilter) && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="h-9 text-xs border-slate-200 hover:bg-slate-50">
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {selectedItems.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
              className="h-9 px-3 text-xs bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5 shadow-sm animate-in fade-in"
            >
              <Trash2 size={14} />
              Delete Selected ({selectedItems.size})
            </Button>
          )}

          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => handleViewModeChange('card')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'card'
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
              title="Card View"
            >
              <LayoutGrid size={14} />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('table')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'table'
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
              title="Table View"
            >
              <LayoutList size={14} />
              <span>Table</span>
            </button>
          </div>

          <span className="text-xs text-slate-400 font-medium shrink-0">
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Main Table / Cards */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0">
        {/* ── Sub-header bar with Select All Checkbox & Count (same as Sales Dispatch Planning) ── */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex-wrap shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600">
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
            </span>
            {selectedItems.size > 0 && (
              <span className="text-primary font-semibold">({selectedItems.size} selected)</span>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
            />
            <span>Select All</span>
          </label>
        </div>

        {viewMode === 'card' ? (
          renderCards()
        ) : (
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0">
            <table className="w-full text-xs">
              <thead className="bg-blue-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="w-16 text-center px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <Input
                        type="checkbox"
                        checked={currentItems.length > 0 && currentItems.every(i => selectedItems.has(i.item_id))}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                        title="Select all on this page"
                      />
                      <span>Action</span>
                    </div>
                  </th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent Date</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent Type</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Group Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Product Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Vendor Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Qty</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Rate</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Amount</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Approve Qty</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Approved By</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Intransit Qty</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Transporter Qty</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Received Qty</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Received Godown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan="16" className="p-12 text-center text-slate-400">
                      <BadgeCheck size={36} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-medium">No purchase indent items found.</p>
                    </td>
                  </tr>
                )}
                {currentItems.map(item => {
                  const hasLifts = item.lifts.length > 0;
                  return (
                    <tr key={item.item_id}
                      onClick={() => hasLifts && setSelectedItem(item)}
                      title={hasLifts ? 'Click to view all lifts for this item' : undefined}
                      className={`hover:bg-slate-50/60 transition-colors ${hasLifts ? 'cursor-pointer' : ''}`}>
                      <td className="px-2 py-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="checkbox"
                            checked={selectedItems.has(item.item_id)}
                            onChange={() => toggleSelect(item.item_id)}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteItem(item);
                            }}
                            disabled={deletingId === item.item_id}
                            title="Delete row"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap text-slate-500 text-xs">
                        {item.indent_date ? format(new Date(item.indent_date), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-800 whitespace-nowrap">
                        {item.indent_number || '—'}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <IndentTypeBadge processType={item.indent_type === 'Direct' ? 'direct' : 'process'} />
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {item.group_name || getGroupNameFromItem(item, groups)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-slate-800 whitespace-nowrap">
                        {item.product_name}
                        <span className="text-slate-500 ml-1">({item.unit || '—'})</span>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-700 font-medium whitespace-nowrap">
                        {item.vendor_name}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-700">
                        {formatNum(item.total_qty)}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600 whitespace-nowrap">
                        {formatMoney(item.rate)}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-800 whitespace-nowrap">
                        {formatMoney(item.total_amount)}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {item.approve_qty !== null ? (
                          <span className="font-semibold text-slate-700">{formatNum(item.approve_qty)}</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Pending</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600 whitespace-nowrap">
                        {item.approved_by_name || '—'}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {item.intransit_qty > 0 ? (
                          <span className="font-semibold text-amber-600">{formatNum(item.intransit_qty)}</span>
                        ) : (
                          <span className="text-slate-300 font-medium">0</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {item.transporter_qty > 0 ? (
                          <span className="font-semibold text-blue-600">{formatNum(item.transporter_qty)}</span>
                        ) : (
                          <span className="text-slate-300 font-medium">0</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {item.received_qty > 0 ? (
                          <span className="font-bold text-emerald-700 underline decoration-dotted underline-offset-2">{formatNum(item.received_qty)}</span>
                        ) : (
                          <span className="text-slate-300 font-medium">0</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-700 whitespace-nowrap">
                        {item.received_godown_str}
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
              {filteredItems.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, filteredItems.length)} of {filteredItems.length} items
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

      <Modal open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
        <ModalContent className="max-w-4xl">
          <ModalHeader>
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 p-1.5 rounded-lg"><Truck size={16} className="text-primary" /></div>
              <div>
                <ModalTitle className="text-base font-bold text-slate-800 leading-tight">
                  {selectedItem?.product_name} — All Lifts
                </ModalTitle>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {selectedItem?.indent_number} &nbsp;·&nbsp; {selectedItem?.vendor_name} {selectedItem?.group_name && selectedItem.group_name !== '—' && `· Group: ${selectedItem.group_name}`}
                </p>
              </div>
            </div>
          </ModalHeader>
          <ModalBody>
            {selectedItem && (
              <>
                <div className="flex flex-wrap items-center gap-4 mb-3 px-1">
                  <span className="text-xs text-slate-500">
                    Total Qty: <span className="font-semibold text-slate-800">{formatNum(selectedItem.total_qty)} {selectedItem.unit}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    In Transit: <span className="font-semibold text-amber-600">{formatNum(selectedItem.intransit_qty)} {selectedItem.unit}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    At Transporter Godown: <span className="font-semibold text-blue-600">{formatNum(selectedItem.transporter_qty)} {selectedItem.unit}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    Received: <span className="font-semibold text-emerald-700">{formatNum(selectedItem.received_qty)} {selectedItem.unit}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    Lifts: <span className="font-semibold text-slate-800">{selectedItem.lifts.length}</span>
                  </span>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto custom-scrollbar max-h-[420px]">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                          <th className="w-12 text-center px-2 py-2.5 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Action</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Lift No.</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Transporter</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">LR No.</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Vehicle No.</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Driver No.</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Qty</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Godown</th>
                          <th className="text-center px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[...selectedItem.lifts]
                          .sort((a, b) => new Date(b.delivery_date) - new Date(a.delivery_date))
                          .map(lift => {
                            const style = LIFT_STATUS_STYLE[lift.status] || LIFT_STATUS_STYLE['In Transit'];
                            const SIcon = style.icon;
                            return (
                              <tr key={lift.delivery_id} className="hover:bg-slate-50">
                                <td className="px-2 py-2.5 text-center whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteLift(lift.delivery_id, lift.lifting_number)}
                                    disabled={deletingId === lift.delivery_id}
                                    title="Delete lift"
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                                <td className="px-3 py-2.5 font-semibold text-teal-700 whitespace-nowrap">{lift.lifting_number || '—'}</td>
                                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                                  {lift.delivery_date ? format(new Date(lift.delivery_date), 'dd/MM/yyyy') : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap">{lift.transporter_name}</td>
                                <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{lift.lr_number || '—'}</td>
                                <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{lift.vehicle_number || '—'}</td>
                                <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{lift.driver_phone_number || '—'}</td>
                                <td className="px-3 py-2.5 text-center font-bold text-emerald-700 whitespace-nowrap">
                                  {formatNum(lift.received_quantity)}
                                </td>
                                <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{lift.godown_name}</td>
                                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>
                                    <SIcon size={10} />{style.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default PurchaseCompleteTable;

