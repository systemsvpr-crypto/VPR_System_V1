import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Save, ShoppingCart, CheckCheck, Clock, History } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAllIndentItemsForVendorSelection, updateVendorSelection } from '../../../services/purchaseService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dropdown } from '@/components/ui/dropdown';
import Pagination from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 15;

const VendorSelectionTable = ({ vendors, godowns = [], user }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [indentFilter, setIndentFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [savingAll, setSavingAll] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [subTab, setSubTab] = useState('pending'); // 'pending' | 'history'

  const [edits, setEdits] = useState({});

  useEffect(() => { loadItems(); }, []);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, indentFilter, productFilter, vendorFilter, subTab]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await getAllIndentItemsForVendorSelection();
      setItems(data);
    } catch {
      toast.error('Failed to load indent items');
      setItems([]);
    }
    setLoading(false);
  };

  const vendorOptions = useMemo(() =>
    vendors.map(v => ({ value: v.vendor_id, label: v.name })),
    [vendors],
  );

  // Only real (Own) godowns are valid delivery destinations — Transporter-type
  // godowns are just stock-tracking placeholders.
  const godownOptions = useMemo(() =>
    godowns
      .filter(g => g.is_active && (g.godown_type || 'Own') === 'Own')
      .map(g => ({ value: g.godown_id, label: g.name })),
    [godowns],
  );

  const indentOptions = useMemo(() => {
    const map = new Map();
    items.forEach(item => {
      const num = item.purchase_indents?.indent_number;
      if (num) map.set(num, num);
    });
    return Array.from(map.values());
  }, [items]);

  const productOptions = useMemo(() => {
    const map = new Map();
    items.forEach(item => {
      const name = item.products?.name;
      if (name) map.set(name, name);
    });
    return Array.from(map.values());
  }, [items]);

  const indentVendorOptions = useMemo(() => {
    const map = new Map();
    items.forEach(item => {
      const name = item.purchase_indents?.vendors?.name;
      if (name) map.set(name, name);
    });
    return Array.from(map.values());
  }, [items]);

  const filteredBySearch = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return items.filter(item => {
      const indent = item.purchase_indents || {};
      const matchIndent = !indentFilter || indent.indent_number === indentFilter;
      const matchProduct = !productFilter || item.products?.name === productFilter;
      const matchVendor = !vendorFilter || indent.vendors?.name === vendorFilter;
      const matchSearch = !term ||
        indent.indent_number?.toLowerCase().includes(term) ||
        item.products?.name?.toLowerCase().includes(term) ||
        indent.vendors?.name?.toLowerCase().includes(term);

      return matchIndent && matchProduct && matchVendor && matchSearch;
    });
  }, [items, searchTerm, indentFilter, productFilter, vendorFilter]);

  const pendingItems = useMemo(() => {
    return filteredBySearch.filter(i => i.planning_status !== 'Planned');
  }, [filteredBySearch]);

  const historyItems = useMemo(() => {
    return filteredBySearch.filter(i => i.planning_status === 'Planned');
  }, [filteredBySearch]);

  const filteredItems = subTab === 'pending' ? pendingItems : historyItems;

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));

  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredItems, currentPage]);

  const getValue = useCallback((item, field) => {
    const edit = edits[item.item_id];
    if (edit && edit[field] !== undefined) return edit[field];
    if (field === 'vendor_id') return item.vendor_id || item.purchase_indents?.vendor_id || '';
    if (field === 'godown_id') return item.approved_godown_id || item.purchase_indents?.godown_id || '';
    if (field === 'rate') return String(item.rate ?? '');
    if (field === 'quantity') return String(item.quantity ?? '');
    if (field === 'planning_date') return item.planning_date || '';
    if (field === 'vendor_remarks') return item.vendor_remarks || '';
    return '';
  }, [edits]);

  // Resolves the final value to persist for each field: whatever was actively
  // edited, falling back to what's currently shown (item's own value, or the
  // indent's original vendor/godown) — so saving without touching a dropdown
  // still writes down the prefilled value instead of leaving it blank.
  const buildSavePayload = (item, edit) => ({
    vendor_id: edit.vendor_id !== undefined ? edit.vendor_id : (item.vendor_id || item.purchase_indents?.vendor_id || null),
    approved_godown_id: edit.godown_id !== undefined ? edit.godown_id : (item.approved_godown_id || item.purchase_indents?.godown_id || null),
    rate: edit.rate !== undefined ? Number(edit.rate) : Number(item.rate || 0),
    quantity: edit.quantity !== undefined ? Number(edit.quantity) : Number(item.quantity || 0),
    planning_date: edit.planning_date !== undefined ? edit.planning_date : item.planning_date,
    vendor_remarks: edit.vendor_remarks !== undefined ? edit.vendor_remarks : item.vendor_remarks,
    planning_status: 'Planned',
    approval_status: 'Approved',
    approved_by: user?.user_id || null,
  });

  const setEditValue = (itemId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  // Picking an Expected Delivery Date for one product fills it in for every
  // other product under the same indent (one indent has one delivery date,
  // not one per line item) AND for every other row currently checkbox-selected
  // — so setting the date once on a multi-row selection applies it to all of them.
  const setPlanningDateForIndent = (item, value) => {
    const indentId = item.purchase_indents?.indent_id;
    setEdits(prev => {
      const next = { ...prev };
      items.forEach(i => {
        const sameIndent = indentId && i.purchase_indents?.indent_id === indentId;
        const isSelected = selectedItems.has(i.item_id);
        if (i.item_id === item.item_id || sameIndent || isSelected) {
          next[i.item_id] = { ...next[i.item_id], planning_date: value };
        }
      });
      return next;
    });
  };

  const resetRow = (itemId) => {
    setEdits(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
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
    if (selectedItems.size === currentItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(currentItems.map(i => i.item_id)));
    }
  };

  const selectedCount = selectedItems.size;
  const allSelected = currentItems.length > 0 && selectedItems.size === currentItems.length;

  const saveAllSelected = async () => {
    const toSave = [...selectedItems].filter(id => {
      const edit = edits[id];
      return edit && (edit.vendor_id !== undefined || edit.godown_id !== undefined || edit.rate !== undefined || edit.quantity !== undefined || edit.planning_date !== undefined || edit.vendor_remarks !== undefined);
    });
    if (toSave.length === 0) { toast.error('No changes to save for selected items.'); return; }
    setSavingAll(true);
    let saved = 0;
    for (const itemId of toSave) {
      const item = items.find(i => i.item_id === itemId);
      if (!item) continue;
      const edit = edits[itemId];
      try {
        const payload = buildSavePayload(item, edit);
        await updateVendorSelection(itemId, payload);
        saved++;
        setItems(prev => prev.map(i => (i.item_id !== itemId ? i : { ...i, ...payload })));
        resetRow(itemId);
      } catch (err) {
        toast.error(`Failed to save item ${item.purchase_indents?.indent_number || itemId}: ${err.message}`);
      }
    }
    setSavingAll(false);
    setSelectedItems(new Set());
    if (saved > 0) toast.success(`${saved} item${saved !== 1 ? 's' : ''} saved successfully`);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading indent items...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs header */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => { setSubTab('pending'); setCurrentPage(1); setSelectedItems(new Set()); }}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
            subTab === 'pending'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Clock size={14} />
          <span>Pending</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
            subTab === 'pending' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {pendingItems.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => { setSubTab('history'); setCurrentPage(1); setSelectedItems(new Set()); }}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 ${
            subTab === 'history'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <History size={14} />
          <span>History</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
            subTab === 'history' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {historyItems.length}
          </span>
        </button>
      </div>

      <div className="flex flex-row items-center justify-between gap-4 shrink-0 overflow-x-auto">
        <div className="flex flex-nowrap items-center gap-3 flex-1 min-w-0">
          <div className="relative w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
            <Input type="text" placeholder="Search indent no., product, vendor..." className="pl-9 h-9 text-xs"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
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
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            value={vendorFilter}
            onChange={e => setVendorFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[150px] shrink-0"
          >
            <option value="">-- All Vendors --</option>
            {indentVendorOptions.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>

          {(searchTerm || indentFilter || productFilter || vendorFilter) && (
            <Button variant="outline" size="sm" onClick={() => { setSearchTerm(''); setIndentFilter(''); setProductFilter(''); setVendorFilter(''); }}
              className="h-9 text-xs border-slate-200 hover:bg-slate-50 shrink-0">
              Clear
            </Button>
          )}
        </div>
        <span className="text-xs text-slate-400 font-medium shrink-0">{filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}</span>
      </div>

      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <ShoppingCart size={32} className="text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-600 mb-1">
            {subTab === 'pending' ? 'No Pending Items' : 'No History Found'}
          </h3>
          <p className="text-sm text-slate-400">
            {searchTerm
              ? 'No items match your search criteria.'
              : subTab === 'pending'
                ? 'All indents have been planned.'
                : 'Planned indents will appear here.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {selectedCount > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-primary/10">
            <span className="text-sm font-medium text-primary flex items-center gap-2">
              <CheckCheck size={16} />
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedItems(new Set())}
                className="text-xs h-8">
                Clear Selection
              </Button>
              <Button size="sm" onClick={saveAllSelected} disabled={savingAll}
                className="gap-1.5 text-xs h-8">
                {savingAll ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
                ) : (
                  <Save size={14} />
                )}
                Save Selected
              </Button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="w-10 px-2 py-3">
                  <input type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent No.</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Unit</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Rate</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Godown</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Updated Vendor</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Expected Delivery Date</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentItems.map(item => {
                const indent = item.purchase_indents || {};
                const isSaved = !!item.vendor_id || !!item.planning_date || !!item.vendor_remarks || Number(item.rate) > 0;
                const selected = selectedItems.has(item.item_id);

                return (
                  <tr key={item.item_id} className={`hover:bg-slate-50 transition-colors ${isSaved ? 'bg-green-50/30' : ''} ${selected ? 'bg-primary/5' : ''}`}>
                    <td className="px-2 py-3 text-center">
                      <input type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(item.item_id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-800 whitespace-nowrap">
                      {indent.indent_number || '—'}
                    </td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {indent.indent_date ? format(new Date(indent.indent_date), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-slate-700 font-medium">{item.products?.name || '—'}</span>
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-slate-500 uppercase whitespace-nowrap">
                      {item.products?.unit || '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="w-20 mx-auto">
                        <Input type="number" step="1" min="1" placeholder="Qty"
                          disabled={subTab === 'history'}
                          value={getValue(item, 'quantity')}
                          onChange={(e) => setEditValue(item.item_id, 'quantity', e.target.value.replace(/\D/g, ''))}
                          className="h-8 text-xs font-semibold text-center" />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="w-24">
                        <Input type="number" step="0.01" min="0" placeholder="Rate"
                          disabled={subTab === 'history'}
                          value={getValue(item, 'rate')}
                          onChange={(e) => setEditValue(item.item_id, 'rate', e.target.value)}
                          className="h-8 text-xs" />
                      </div>
                    </td>
                    <td className="px-3 py-3 min-w-[150px]">
                      <Dropdown value={getValue(item, 'godown_id')}
                        onValueChange={(v) => setEditValue(item.item_id, 'godown_id', v)}
                        options={godownOptions} placeholder="Select godown..."
                        searchPlaceholder="Search godowns..." align="start" />
                    </td>
                    <td className="px-3 py-3 min-w-[160px]">
                      <Dropdown value={getValue(item, 'vendor_id')}
                        onValueChange={(v) => setEditValue(item.item_id, 'vendor_id', v)}
                        options={vendorOptions} placeholder="Select vendor..."
                        searchPlaceholder="Search vendors..." align="start" />
                    </td>
                    <td className="px-3 py-3 min-w-[140px]">
                      <DatePicker value={getValue(item, 'planning_date')}
                        disabled={subTab === 'history'}
                        onChange={(e) => setPlanningDateForIndent(item, e.target.value)}
                        placeholder="Select date..." />
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        item.planning_status === 'Planned'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {item.planning_status || 'Pending'}
                      </span>
                    </td>
                    <td className="px-3 py-3 min-w-[130px]">
                      <Input type="text" placeholder="Remarks"
                        value={getValue(item, 'vendor_remarks')}
                        onChange={(e) => setEditValue(item.item_id, 'vendor_remarks', e.target.value)}
                        className="h-8 text-xs" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
    )}
    </div>
  );
};

export default VendorSelectionTable;
