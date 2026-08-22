import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Save, ShoppingCart, Clock, History, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAllIndentItemsForVendorSelection, updateVendorSelection } from '../../../services/purchaseService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { sanitizeQtyInput } from '@/lib/qty';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const STATUS_OPTIONS = [
  { value: 'Approved', label: 'Approved' },
  { value: 'Rejected', label: 'Reject' },
];

const VendorSelectionTable = ({ vendors, godowns = [], user }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [indentFilter, setIndentFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [savingAll, setSavingAll] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [subTab, setSubTab] = useState('pending'); // 'pending' | 'history'

  const [edits, setEdits] = useState({});

  useEffect(() => { loadItems(); }, []);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, indentFilter, productFilter, vendorFilter, subTab, pageSize]);

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

  // The indent header itself rarely carries a vendor here — it's picked per
  // item, on this very screen — so the vendor filter has to read the same
  // vendor_id/approved_vendor_id every item row itself reads, resolved
  // against the Vendor Master, not a `purchase_indents.vendors` embed that's
  // never actually populated for Process-type indents.
  const getItemVendorName = useCallback((item) => {
    const vendorId = item.vendor_id || item.approved_vendor_id || item.purchase_indents?.vendor_id;
    return vendors.find(v => v.vendor_id === vendorId)?.name || '';
  }, [vendors]);

  const indentVendorOptions = useMemo(() => {
    const map = new Map();
    items.forEach(item => {
      const name = getItemVendorName(item);
      if (name) map.set(name, name);
    });
    return Array.from(map.values());
  }, [items, getItemVendorName]);

  const filteredBySearch = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return items.filter(item => {
      const indent = item.purchase_indents || {};
      const vendorName = getItemVendorName(item);
      const matchIndent = !indentFilter || indent.indent_number === indentFilter;
      const matchProduct = !productFilter || item.products?.name === productFilter;
      const matchVendor = !vendorFilter || vendorName === vendorFilter;
      const matchSearch = !term ||
        indent.indent_number?.toLowerCase().includes(term) ||
        item.products?.name?.toLowerCase().includes(term) ||
        vendorName.toLowerCase().includes(term);

      return matchIndent && matchProduct && matchVendor && matchSearch;
    });
  }, [items, searchTerm, indentFilter, productFilter, vendorFilter]);

  const pendingItems = useMemo(() => {
    return filteredBySearch.filter(i =>
      i.purchase_indents?.process_type === 'process' &&
      i.planning_status === 'Planned' &&
      i.approval_status !== 'Approved' &&
      i.approval_status !== 'Rejected'
    );
  }, [filteredBySearch]);

  const historyItems = useMemo(() => {
    return filteredBySearch.filter(i => i.approval_status === 'Approved' || i.approval_status === 'Rejected');
  }, [filteredBySearch]);

  const filteredItems = subTab === 'pending' ? pendingItems : historyItems;

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));

  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const getValue = useCallback((item, field) => {
    const edit = edits[item.item_id];
    if (edit && edit[field] !== undefined) return edit[field];
    if (field === 'vendor_id') return item.vendor_id || item.purchase_indents?.vendor_id || '';
    if (field === 'godown_id') return item.approved_godown_id || item.purchase_indents?.godown_id || '';
    if (field === 'quantity') return String(item.quantity ?? '');
    if (field === 'approval_action') return (item.approval_status === 'Approved' || item.approval_status === 'Rejected') ? item.approval_status : '';
    if (field === 'approval_remarks') return item.approved_remarks || '';
    return '';
  }, [edits]);

  // Rate, Expected Delivery Date and Remarks were already locked in during
  // planning (Indent tab) — this screen only lets the approver adjust the
  // Approve Qty, override the vendor, and record the Approved/Reject decision
  // with its own remarks, so those three are passed through unchanged.
  const buildSavePayload = (item, edit) => ({
    vendor_id: edit.vendor_id !== undefined ? edit.vendor_id : (item.vendor_id || item.purchase_indents?.vendor_id || null),
    approved_godown_id: item.approved_godown_id || item.purchase_indents?.godown_id || null,
    rate: Number(item.rate || 0),
    quantity: edit.quantity !== undefined ? Number(edit.quantity) : Number(item.quantity || 0),
    planning_date: item.planning_date,
    vendor_remarks: item.vendor_remarks,
    planning_status: 'Planned',
    approval_status: edit.approval_action,
    approved_remarks: edit.approval_remarks !== undefined ? edit.approval_remarks : '',
    approved_by: user?.user_id || null,
  });

  const setEditValue = (itemId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const resetRow = (itemId) => {
    setEdits(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  // Checking a row defaults its Status dropdown to Approved so the common
  // case needs no extra click — the user can still switch it to Reject
  // before saving. Only fills in when nothing's been chosen yet, so it never
  // clobbers a decision the user already made.
  const defaultApprovalAction = (itemIds) => {
    setEdits(prev => {
      const next = { ...prev };
      itemIds.forEach(id => {
        if (!next[id]?.approval_action) next[id] = { ...next[id], approval_action: 'Approved' };
      });
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
    if (!selectedItems.has(itemId)) defaultApprovalAction([itemId]);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === currentItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(currentItems.map(i => i.item_id)));
      defaultApprovalAction(currentItems.map(i => i.item_id));
    }
  };

  const selectedCount = selectedItems.size;
  const allSelected = currentItems.length > 0 && selectedItems.size === currentItems.length;

  const saveAllSelected = async () => {
    const selectedIds = [...selectedItems];
    if (selectedIds.length === 0) { toast.error('No items selected.'); return; }
    const missingStatus = selectedIds.filter(id => !edits[id]?.approval_action);
    if (missingStatus.length > 0) {
      toast.error(`Select Approved or Reject for ${missingStatus.length} item${missingStatus.length !== 1 ? 's' : ''} before saving.`);
      return;
    }
    const toSave = selectedIds;
    setSavingAll(true);
    // Only a row that actually saves drops out of selection — one that fails
    // (e.g. a save error) stays checked with its edits untouched, so the user
    // doesn't have to re-select it and redo the decision after fixing it.
    const savedIds = new Set();
    for (const itemId of toSave) {
      const item = items.find(i => i.item_id === itemId);
      if (!item) continue;
      const edit = edits[itemId];
      try {
        const payload = buildSavePayload(item, edit);
        await updateVendorSelection(itemId, payload);
        savedIds.add(itemId);
        setItems(prev => prev.map(i => (i.item_id !== itemId ? i : { ...i, ...payload })));
        resetRow(itemId);
      } catch (err) {
        toast.error(`Failed to save item ${item.purchase_indents?.indent_number || itemId}: ${err.message}`);
      }
    }
    setSavingAll(false);
    setSelectedItems(prev => { const next = new Set(prev); savedIds.forEach(id => next.delete(id)); return next; });
    if (savedIds.size > 0) toast.success(`${savedIds.size} item${savedIds.size !== 1 ? 's' : ''} saved successfully`);
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
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Everything in one wrapping row: Pending/History toggle + search +
          filters + item count. */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => { setSubTab('pending'); setCurrentPage(1); setSelectedItems(new Set()); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              subTab === 'pending'
                ? 'bg-primary/10 text-primary'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Clock size={14} />
            Pending
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              subTab === 'pending' ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-500'
            }`}>
              {pendingItems.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setSubTab('history'); setCurrentPage(1); setSelectedItems(new Set()); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              subTab === 'history'
                ? 'bg-primary/10 text-primary'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <History size={14} />
            History
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              subTab === 'history' ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-500'
            }`}>
              {historyItems.length}
            </span>
          </button>
        </div>

        <div className="relative w-full sm:flex-1 sm:min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
          <Input type="text" placeholder="Search indent no., product, vendor..." className="pl-9 h-9 text-xs w-full"
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        <select
          value={indentFilter}
          onChange={e => setIndentFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[150px] shrink-0"
        >
          <option value="">-- All Indents --</option>
          {indentOptions.map(num => (
            <option key={num} value={num}>{num}</option>
          ))}
        </select>

        <select
          value={productFilter}
          onChange={e => setProductFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[150px] shrink-0"
        >
          <option value="">-- All Products --</option>
          {productOptions.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          value={vendorFilter}
          onChange={e => setVendorFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[150px] shrink-0"
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

        <Button size="sm" onClick={saveAllSelected} disabled={savingAll || selectedCount === 0}
          className="gap-1.5 text-xs h-9 w-full sm:w-auto shrink-0 sm:ml-auto">
          {savingAll ? (
            <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
          ) : (
            <Save size={14} />
          )}
          Save Selected
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 flex flex-col flex-1 min-h-0">
        <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0">
          <table className="w-full text-sm">
            <thead className="bg-blue-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="w-10 px-2 py-3">
                  <input type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                </th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent No.</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Unit</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Qty</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Approve Qty</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Rate</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Vendor Name</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Expected Delivery Date</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Remarks</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Approval Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan="13" className="p-12 text-center">
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
                  </td>
                </tr>
              )}
              {currentItems.map(item => {
                const indent = item.purchase_indents || {};
                const hasDecision = !!edits[item.item_id]?.approval_action;
                const selected = selectedItems.has(item.item_id);

                return (
                  <tr key={item.item_id} className={`hover:bg-slate-50 transition-colors ${hasDecision ? 'bg-green-50/30' : ''} ${selected ? 'bg-primary/5' : ''}`}>
                    <td className="px-2 py-3 text-center">
                      <input type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(item.item_id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                    </td>
                    <td className="px-3 py-3 text-center font-medium text-slate-800 whitespace-nowrap">
                      {indent.indent_number || '—'}
                    </td>
                    <td className="px-3 py-3 text-center text-slate-500 whitespace-nowrap text-xs">
                      {indent.indent_date ? format(new Date(indent.indent_date), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-slate-700 font-medium">{item.products?.name || '—'}</span>
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-slate-500 uppercase whitespace-nowrap">
                      {item.products?.unit || '—'}
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-slate-500 font-medium whitespace-nowrap">
                      {item.indent_qty ?? item.quantity ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="w-20 mx-auto">
                        <Input type="text" inputMode="decimal" placeholder="Qty"
                          disabled={subTab === 'history'}
                          value={getValue(item, 'quantity')}
                          onChange={(e) => setEditValue(item.item_id, 'quantity', sanitizeQtyInput(e.target.value))}
                          className="h-8 text-xs font-semibold text-center" />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-600 text-xs whitespace-nowrap">
                      ₹{Number(item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 min-w-[160px]">
                      <Dropdown value={getValue(item, 'vendor_id')}
                        onValueChange={(v) => setEditValue(item.item_id, 'vendor_id', v)}
                        options={vendorOptions} placeholder="Select vendor..."
                        searchPlaceholder="Search vendors..." align="start" />
                    </td>
                    <td className="px-3 py-3 text-center text-slate-500 text-xs whitespace-nowrap">
                      {item.planning_date ? format(new Date(item.planning_date), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="px-3 py-3 text-center text-slate-600 text-xs min-w-[130px]">
                      {item.vendor_remarks || '—'}
                    </td>
                    <td className="px-3 py-3 min-w-[130px]">
                      <Dropdown value={getValue(item, 'approval_action')}
                        onValueChange={(v) => setEditValue(item.item_id, 'approval_action', v)}
                        options={STATUS_OPTIONS} placeholder="Select status..."
                        disabled={subTab === 'history'} align="start" />
                    </td>
                    <td className="px-3 py-3 min-w-[140px]">
                      <Input type="text" placeholder="Remarks"
                        disabled={subTab === 'history'}
                        value={getValue(item, 'approval_remarks')}
                        onChange={(e) => setEditValue(item.item_id, 'approval_remarks', e.target.value)}
                        className="h-8 text-xs text-center" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

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
    </div>
  );
};

export default VendorSelectionTable;
