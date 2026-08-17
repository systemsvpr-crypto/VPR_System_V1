import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Check, History, Clock, Search } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  getApprovedItemsForDelivery,
  getAawakDeliveries,
  createDelivery,
  cancelIndentItem,
  getPackagingSize,
} from '../../../services/purchaseService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Pagination from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 15;

const DeliveryTable = ({ transporters = [], user, godowns = [] }) => {
  const [activeSubTab, setActiveSubTab] = useState('pending'); // 'pending' | 'history'
  const [items, setItems] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [indentFilter, setIndentFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [rowEdits, setRowEdits] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, indentFilter, productFilter, vendorFilter, activeSubTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [approvedData, historyData] = await Promise.all([
        getApprovedItemsForDelivery(),
        getAawakDeliveries(),
      ]);
      setItems(approvedData.filter(i =>
        i.planning_status !== 'Cancelled' && Number(i.remaining_alloc_qty ?? i.remaining_qty ?? 0) > 0
      ));
      setHistoryItems(historyData || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load delivery data');
      setItems([]);
      setHistoryItems([]);
    }
    setLoading(false);
  };

  const indentOptions = useMemo(() => {
    const map = new Map();
    const targetList = activeSubTab === 'pending' ? items : historyItems;
    targetList.forEach(i => {
      const num = activeSubTab === 'pending'
        ? i.purchase_indents?.indent_number
        : i.purchase_indent_items?.purchase_indents?.indent_number;
      if (num) map.set(num, num);
    });
    return Array.from(map.values());
  }, [items, historyItems, activeSubTab]);

  const productOptions = useMemo(() => {
    const map = new Map();
    if (activeSubTab === 'pending') {
      items.forEach(i => {
        if (i.product_id && i.products?.name) {
          map.set(String(i.product_id), i.products.name);
        }
      });
    } else {
      historyItems.forEach(h => {
        const p = h.purchase_indent_items?.products;
        if (p?.name) map.set(p.name, p.name);
      });
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items, historyItems, activeSubTab]);

  const vendorOptions = useMemo(() => {
    const map = new Map();
    items.forEach(i => {
      const vId = i.item_vendor?.vendor_id || i.vendor_id || i.purchase_indents?.vendor_id;
      const vName = i.item_vendor?.name || i.purchase_indents?.vendors?.name;
      if (vId && vName) map.set(String(vId), vName);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return items.filter(item => {
      const indent = item.purchase_indents || {};
      const matchIndent = !indentFilter || indent.indent_number === indentFilter;
      const matchProduct = !productFilter || String(item.product_id) === productFilter;
      const itemVendorId = item.item_vendor?.vendor_id || item.vendor_id || indent.vendor_id;
      const matchVendor = !vendorFilter || String(itemVendorId) === vendorFilter;
      const pName = item.products?.name?.toLowerCase() || '';
      const vName = (item.item_vendor?.name || indent.vendors?.name || '').toLowerCase();
      const iNum = (indent.indent_number || '').toLowerCase();
      const matchSearch = !term || iNum.includes(term) || pName.includes(term) || vName.includes(term);
      return matchIndent && matchProduct && matchVendor && matchSearch;
    });
  }, [items, indentFilter, productFilter, vendorFilter, searchTerm]);

  const filteredHistoryItems = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return historyItems.filter(h => {
      const indent = h.purchase_indent_items?.purchase_indents || {};
      const matchIndent = !indentFilter || indent.indent_number === indentFilter;
      const pName = h.purchase_indent_items?.products?.name || '';
      const matchProduct = !productFilter || pName === productFilter || String(h.purchase_indent_items?.product_id) === productFilter;
      const tName = h.transporters?.name || '';
      const matchVendor = !vendorFilter || tName === vendorFilter;
      const vName = h.purchase_indent_items?.item_vendor?.name || indent.vendors?.name || '';
      const iNum = indent.indent_number || h.lifting_number || '';
      const matchSearch = !term || iNum.toLowerCase().includes(term) || pName.toLowerCase().includes(term) || vName.toLowerCase().includes(term) || tName.toLowerCase().includes(term);
      return matchIndent && matchProduct && matchVendor && matchSearch;
    });
  }, [historyItems, indentFilter, productFilter, vendorFilter, searchTerm]);

  const currentList = activeSubTab === 'pending' ? filteredItems : filteredHistoryItems;
  const totalPages = Math.max(1, Math.ceil(currentList.length / ITEMS_PER_PAGE));
  const currentPageItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return currentList.slice(start, start + ITEMS_PER_PAGE);
  }, [currentList, currentPage]);

  const getRowVal = (itemId, field, defaultVal = '') => {
    const edit = rowEdits[itemId];
    if (edit && edit[field] !== undefined) return edit[field];
    return defaultVal;
  };

  const setRowVal = (itemId, field, value) => {
    setRowEdits(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const handleTransporterChange = (itemId, transporterId) => {
    const selectedTransporter = transporters.find(t => String(t.transporter_id) === String(transporterId));
    setRowEdits(prev => {
      const current = prev[itemId] || {};
      return {
        ...prev,
        [itemId]: {
          ...current,
          transporter_id: transporterId,
          vehicle_number: transporterId ? (selectedTransporter?.vehicle_number || current.vehicle_number || '') : '',
          driver_phone_number: transporterId ? (selectedTransporter?.driver_phone_number || current.driver_phone_number || '') : '',
          lr_number: transporterId ? (current.lr_number || '') : '',
        },
      };
    });
  };

  const hasAnyTransporterSelected = useMemo(() => {
    return currentPageItems.some(item => !!getRowVal(item.item_id, 'transporter_id'));
  }, [currentPageItems, rowEdits]);

  const handleReceivedQtyChange = (item, val) => {
    setRowEdits(prev => ({
      ...prev,
      [item.item_id]: {
        ...prev[item.item_id],
        del_qty_kg: val,
      },
    }));
  };

  const toggleSelect = (itemId) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (currentPageItems.length > 0 && currentPageItems.every(i => selectedItems.has(i.item_id))) {
      setSelectedItems(prev => {
        const next = new Set(prev);
        currentPageItems.forEach(i => next.delete(i.item_id));
        return next;
      });
    } else {
      setSelectedItems(prev => {
        const next = new Set(prev);
        currentPageItems.forEach(i => next.add(i.item_id));
        return next;
      });
    }
  };

  const allSelected = activeSubTab === 'pending' && currentPageItems.length > 0 && currentPageItems.every(i => selectedItems.has(i.item_id));

  const handleSubmitDeliveries = async () => {
    const toSubmitIds = [...selectedItems];
    if (toSubmitIds.length === 0) {
      toast.error('Please select at least one item using the checkbox to submit delivery.');
      return;
    }

    setSubmitting(true);
    let successCount = 0;

    for (const itemId of toSubmitIds) {
      const item = items.find(i => i.item_id === itemId);
      if (!item) continue;
      const edit = rowEdits[itemId] || {};
      const delQty = Number(edit.del_qty_kg || 0);

      if (delQty <= 0) {
        toast.error(`Please enter valid Del. Qty for indent ${item.purchase_indents?.indent_number}`);
        continue;
      }

      const defaultGodownId = item.approved_godown_id || item.purchase_indents?.godown_id || godowns[0]?.godown_id;

      const selectedTransporter = transporters.find(t => String(t.transporter_id) === String(edit.transporter_id));

      try {
        await createDelivery({
          item_id: item.item_id,
          indent_id: item.purchase_indents?.indent_id,
          delivery_date: new Date().toISOString().slice(0, 10),
          expected_delivery_date: edit.exp_date !== undefined ? edit.exp_date : (item.planning_date || null),
          godown_allocations: defaultGodownId ? [{ godown_id: defaultGodownId, qty: delQty }] : [],
          transporter_id: edit.transporter_id || null,
          lr_number: edit.lr_number || null,
          vehicle_number: edit.vehicle_number || selectedTransporter?.vehicle_number || null,
          driver_phone_number: edit.driver_phone_number || selectedTransporter?.driver_phone_number || null,
          remarks: edit.remarks || null,
          created_by: user?.user_id,
          // Newly dispatched lifts start "In Transit" so they land in Aawak
          // Details' Pending tab for review — "AT TPT GDN" (which records
          // stock at the transporter's godown) is set explicitly from there.
          status: 'In Transit',
        });
        successCount++;
      } catch (err) {
        toast.error(`Failed for ${item.purchase_indents?.indent_number}: ${err.message}`);
      }
    }

    setSubmitting(false);
    if (successCount > 0) {
      toast.success(`${successCount} delivery lift${successCount !== 1 ? 's' : ''} submitted successfully!`);
      setSelectedItems(new Set());
      setRowEdits({});
      loadData();
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setIndentFilter('');
    setProductFilter('');
    setVendorFilter('');
  };

  const renderStatusBadge = (status) => {
    if (status === 'In Transit') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
          In Transit
        </span>
      );
    }
    if (status === 'In Transport Godown' || status === 'AT TPT GDN') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
          AT TPT GDN
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
        Arrived
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading delivery data...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Sub-tabs Bar (Pending & History) styled like Dispatch Day */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => { setActiveSubTab('pending'); setCurrentPage(1); setSelectedItems(new Set()); }}
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
            {items.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => { setActiveSubTab('history'); setCurrentPage(1); setSelectedItems(new Set()); }}
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
            {historyItems.length}
          </span>
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-row items-center justify-between gap-4 shrink-0 overflow-x-auto">
        <div className="flex flex-nowrap items-center gap-3 flex-1 min-w-0">
          <div className="relative w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
            <Input
              type="text"
              placeholder="Search indent no., product, vendor..."
              className="pl-9 h-9 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            value={indentFilter}
            onChange={e => setIndentFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[150px] shrink-0"
          >
            <option value="">-- All Indents --</option>
            {indentOptions.map(num => (
              <option key={num} value={num}>{num}</option>
            ))}
          </select>

          <select
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[150px] shrink-0"
          >
            <option value="">-- All Products --</option>
            {productOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {activeSubTab === 'pending' ? (
            <select
              value={vendorFilter}
              onChange={e => setVendorFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[150px] shrink-0"
            >
              <option value="">-- All Vendors --</option>
              {vendorOptions.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          ) : (
            <select
              value={vendorFilter}
              onChange={e => setVendorFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[150px] shrink-0"
            >
              <option value="">-- All Transporters --</option>
              {transporters.map(t => (
                <option key={t.transporter_id} value={t.name}>{t.name}</option>
              ))}
            </select>
          )}

          {(searchTerm || indentFilter || productFilter || vendorFilter) && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="h-9 text-xs border-slate-200 hover:bg-slate-50 shrink-0">
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-400 font-medium whitespace-nowrap">{currentList.length} item{currentList.length !== 1 ? 's' : ''}</span>
          {activeSubTab === 'pending' && (
            <Button onClick={handleSubmitDeliveries} disabled={submitting} size="sm" className="h-9 px-4 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium gap-1.5 shadow-sm">
              {submitting ? (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
              ) : (
                <Check size={14} />
              )}
              Submit
            </Button>
          )}
        </div>
      </div>

      {/* Main Table - Modern Dispatch Day Container */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {currentList.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <ShoppingCart size={36} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium">
              {activeSubTab === 'pending' ? 'No approved deliveries available.' : 'No delivery history found.'}
            </p>
          </div>
        ) : activeSubTab === 'pending' ? (
          /* PENDING TABLE */
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="w-10 px-2 py-3 text-center">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                  </th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent No.</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Vendor Name</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">UOM</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Pending Qty</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Pkg/Bag</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px]">Remarks</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px]">Exp. Date</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Actual Date</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[100px] whitespace-nowrap">Received Qty</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[140px]">Transporter</th>
                  {hasAnyTransporterSelected && (
                    <>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[120px] whitespace-nowrap">LR No.</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px] whitespace-nowrap">Vehicle No.</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[130px] whitespace-nowrap">Driver No.</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentPageItems.map(item => {
                  const indent = item.purchase_indents || {};
                  const isSelected = selectedItems.has(item.item_id);
                  const pkgSize = getPackagingSize(item.products);
                  const transpId = getRowVal(item.item_id, 'transporter_id');
                  const selectedTransporter = transporters.find(t => String(t.transporter_id) === String(transpId));

                  return (
                    <tr key={item.item_id} className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                      <td className="px-2 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item.item_id)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-500 text-xs">
                        {indent.indent_date ? format(new Date(indent.indent_date), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-800 whitespace-nowrap">
                        {indent.indent_number || '—'}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-700 whitespace-nowrap">
                        {item.item_vendor?.name || indent.vendors?.name || '—'}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-slate-800 font-medium">{item.products?.name || '—'}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-500 uppercase text-xs">
                        {item.products?.unit || '—'}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-700">
                        {item.quantity}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-amber-600">
                        {item.remaining_alloc_qty ?? item.remaining_qty}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600">
                        {item.rate ? Number(item.rate).toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-500">
                        {pkgSize}
                      </td>
                      <td className="px-3 py-3">
                        <Input
                          type="text"
                          placeholder="Remarks..."
                          value={getRowVal(item.item_id, 'remarks')}
                          onChange={e => setRowVal(item.item_id, 'remarks', e.target.value)}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Input
                          type="date"
                          value={getRowVal(item.item_id, 'exp_date', item.planning_date || '')}
                          onChange={e => setRowVal(item.item_id, 'exp_date', e.target.value)}
                          className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white"
                        />
                      </td>
                      <td className="px-3 py-3 text-center text-slate-500 whitespace-nowrap">
                        {format(new Date(), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-3 py-3">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Received Qty"
                          value={getRowVal(item.item_id, 'del_qty_kg')}
                          onChange={e => handleReceivedQtyChange(item, e.target.value)}
                          className="h-8 text-xs font-semibold text-center bg-slate-50/50 border-slate-200 focus:bg-white"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={transpId}
                          onChange={e => handleTransporterChange(item.item_id, e.target.value)}
                          className="w-full h-8 text-xs px-2.5 rounded-md border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[140px]"
                        >
                          <option value="">Select transp...</option>
                          {transporters.map(t => (
                            <option key={t.transporter_id} value={t.transporter_id}>{t.name}</option>
                          ))}
                        </select>
                      </td>
                      {hasAnyTransporterSelected && (
                        <>
                          <td className="px-3 py-3">
                            {transpId ? (
                              <Input
                                type="text"
                                placeholder="LR No."
                                value={getRowVal(item.item_id, 'lr_number')}
                                onChange={e => setRowVal(item.item_id, 'lr_number', e.target.value)}
                                className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white min-w-[110px]"
                              />
                            ) : (
                              <span className="text-slate-300 text-center block">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {transpId ? (
                              <Input
                                type="text"
                                placeholder="Vehicle No."
                                value={getRowVal(item.item_id, 'vehicle_number', selectedTransporter?.vehicle_number || '')}
                                onChange={e => setRowVal(item.item_id, 'vehicle_number', e.target.value)}
                                className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white min-w-[120px]"
                              />
                            ) : (
                              <span className="text-slate-300 text-center block">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {transpId ? (
                              <Input
                                type="text"
                                placeholder="Driver No."
                                value={getRowVal(item.item_id, 'driver_phone_number', selectedTransporter?.driver_phone_number || '')}
                                onChange={e => setRowVal(item.item_id, 'driver_phone_number', e.target.value)}
                                className="h-8 text-xs bg-slate-50/50 border-slate-200 focus:bg-white min-w-[120px]"
                              />
                            ) : (
                              <span className="text-slate-300 text-center block">—</span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* HISTORY TABLE */
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Lifting No.</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent No.</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Vendor Name</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Received Qty</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Transporter</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">LR No.</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Driver No.</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Vehicle No.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentPageItems.map(del => {
                  const prod = del.purchase_indent_items?.products || {};
                  const qtyKg = Number(del.received_quantity || 0);
                  const indentNum = del.purchase_indent_items?.purchase_indents?.indent_number || '—';
                  const vendorName = del.purchase_indent_items?.item_vendor?.name || del.purchase_indent_items?.purchase_indents?.vendors?.name || '—';

                  return (
                    <tr key={del.delivery_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-3 whitespace-nowrap text-slate-500 text-xs">
                        {del.delivery_date ? format(new Date(del.delivery_date), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-800 whitespace-nowrap">
                        {del.lifting_number || '—'}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">
                        {indentNum}
                      </td>
                      <td className="px-3 py-3 text-slate-700 font-medium whitespace-nowrap">
                        {vendorName}
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-800">
                        {prod.name || '—'}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-emerald-700">
                        {qtyKg}
                      </td>
                      <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                        {del.transporters?.name || '—'}
                      </td>
                      <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                        {del.lr_number || '—'}
                      </td>
                      <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                        {del.driver_phone_number || '—'}
                      </td>
                      <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                        {del.vehicle_number || '—'}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        {renderStatusBadge(del.status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {currentList.length > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={currentList.length}
            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, currentList.length)}
            onPageChange={setCurrentPage}
            className="border-t border-slate-200"
          />
        )}
      </div>
    </div>
  );
};

export default DeliveryTable;
