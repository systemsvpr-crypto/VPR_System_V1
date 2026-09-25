import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Save, ShoppingCart, Clock, History, ChevronLeft, ChevronRight, Trash2, LayoutGrid, LayoutList } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAllIndentItemsForVendorSelection, updateVendorSelection, getPackagingSize, deleteIndentItem } from '../../../services/purchaseService';
import { getGroupNameFromItem } from '../../../services/productGroupingService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { sanitizeQtyInput, roundQty } from '@/lib/qty';
import FilterMenu from '@/components/FilterMenu';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const STATUS_OPTIONS = [
  { value: 'Approved', label: 'Approved' },
  { value: 'Rejected', label: 'Reject' },
];

// Bag <-> Kg conversion. Qty is entered in whichever unit the row's Approve
// Unit dropdown is set to (`fromUnit`, defaulting to the product's master
// unit) — whichever of Bag/Kg matches that entry unit just mirrors Qty
// as-is, the other is derived via this row's own Pkg/Bag (Mux) figure.
const convertApproveQty = (qty, fromUnit, targetUnit, pkgSize) => {
  const amount = Number(qty) || 0;
  const mux = Number(pkgSize) || 0;
  const from = (fromUnit || '').toLowerCase();
  const target = (targetUnit || from).toLowerCase();
  if (!from || target === from) return amount;
  if (from === 'bag' && target === 'kg') return mux > 0 ? amount * mux : amount;
  if (from === 'kg' && target === 'bag') return mux > 0 ? amount / mux : amount;
  return amount;
};

const VendorSelectionTable = ({ vendors, godowns = [], user, groups = [] }) => {
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
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('purchase_view_mode') || 'card');
  const [deletingSelected, setDeletingSelected] = useState(false);

  const [edits, setEdits] = useState({});
  const [expandedPlanIds, setExpandedPlanIds] = useState(new Set());

  const toggleExpandPlan = (itemId) => {
    setExpandedPlanIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

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
      const groupName = getGroupNameFromItem(item, groups);
      const matchIndent = !indentFilter || indent.indent_number === indentFilter;
      const matchProduct = !productFilter || item.products?.name === productFilter;
      const matchVendor = !vendorFilter || vendorName === vendorFilter;
      const matchSearch = !term ||
        indent.indent_number?.toLowerCase().includes(term) ||
        item.products?.name?.toLowerCase().includes(term) ||
        (groupName && groupName !== '—' && groupName.toLowerCase().includes(term)) ||
        vendorName.toLowerCase().includes(term);

      return matchIndent && matchProduct && matchVendor && matchSearch;
    });
  }, [items, searchTerm, indentFilter, productFilter, vendorFilter, groups, getItemVendorName]);

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
  const isEmpty = filteredItems.length === 0;

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
    if (field === 'approval_action') return (item.approval_status === 'Approved' || item.approval_status === 'Rejected') ? item.approval_status : '';
    if (field === 'approval_remarks') return item.approved_remarks || '';
    // Approve Unit defaults to the product's master unit; Qty (raw, as typed
    // in that unit) defaults to whatever was saved before, falling back to
    // the item's current quantity for rows that predate this feature.
    if (field === 'approve_unit') return item.approve_unit || (item.products?.unit || '').toLowerCase();
    if (field === 'approve_unit_qty') return item.approve_unit_qty != null ? String(item.approve_unit_qty) : String(item.quantity ?? '');
    return '';
  }, [edits]);

  // Approve Qty is auto-calculated from the Approve Unit + Qty inputs,
  // converted into the product's master unit via that product's Pkg/Bag
  // (Mux) figure — this is what actually gets saved as quantity (the value
  // that drives the rest of the purchase pipeline).
  const getApprovedQtyPreview = useCallback((item) => {
    const masterUnit = (item.products?.unit || '').toLowerCase();
    const pkgSize = getPackagingSize(item.products);
    const approveUnit = getValue(item, 'approve_unit');
    const qty = getValue(item, 'approve_unit_qty');
    return roundQty(convertApproveQty(qty, approveUnit, masterUnit, pkgSize));
  }, [getValue]);

  // Switching Approve Unit re-bases whatever Qty is currently showing into
  // the newly picked unit (e.g. 20 bags becomes 640 when switching to Kg) so
  // a stale number typed in the old unit doesn't linger under a new one.
  const handleApproveUnitChange = (item, newUnit) => {
    const currentUnit = getValue(item, 'approve_unit');
    const currentQty = getValue(item, 'approve_unit_qty');
    const pkgSize = getPackagingSize(item.products);
    const requantified = convertApproveQty(currentQty, currentUnit, newUnit, pkgSize);
    setEdits(prev => ({
      ...prev,
      [item.item_id]: {
        ...prev[item.item_id],
        approve_unit: newUnit,
        approve_unit_qty: requantified ? String(roundQty(requantified)) : '',
      },
    }));
  };

  // Rate, Expected Delivery Date and Remarks were already locked in during
  // planning (Indent tab) — this screen only lets the approver adjust the
  // Approve Unit + Qty (Approve Qty is derived from those, see
  // getApprovedQtyPreview), override the vendor, and record the
  // Approved/Reject decision with its own remarks, so those other fields are
  // passed through unchanged.
  const buildSavePayload = (item, edit) => {
    const approveUnit = getValue(item, 'approve_unit');
    const approveUnitQty = getValue(item, 'approve_unit_qty');
    const approveQty = getApprovedQtyPreview(item);
    return {
      vendor_id: edit.vendor_id !== undefined ? edit.vendor_id : (item.vendor_id || item.purchase_indents?.vendor_id || null),
      approved_godown_id: item.approved_godown_id || item.purchase_indents?.godown_id || null,
      rate: Number(item.rate || 0),
      quantity: approveQty,
      approve_unit: approveUnit,
      approve_unit_qty: Number(approveUnitQty) || 0,
      approve_qty: approveQty,
      planning_date: item.planning_date,
      vendor_remarks: item.vendor_remarks,
      planning_status: 'Planned',
      approval_status: edit.approval_action,
      approved_remarks: edit.approval_remarks !== undefined ? edit.approval_remarks : '',
      approved_by: user?.user_id || null,
    };
  };

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

  const handleDeleteRow = async (item) => {
    const pName = item.products?.name || 'this product';
    const iNum = item.purchase_indents?.indent_number || '';
    if (!window.confirm(`Permanently delete "${pName}"${iNum ? ` from indent "${iNum}"` : ''}? This cannot be undone.`)) return;
    try {
      await deleteIndentItem(item.item_id);
      toast.success('Indent item deleted');
      setItems(prev => prev.filter(i => i.item_id !== item.item_id));
      setSelectedItems(prev => {
        const next = new Set(prev);
        next.delete(item.item_id);
        return next;
      });
      loadItems();
    } catch (err) {
      toast.error(err.message || 'Failed to delete item');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedCount === 0) { toast.error('No items selected.'); return; }
    if (!window.confirm(`Permanently delete ${selectedCount} selected item${selectedCount !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setDeletingSelected(true);
    let successCount = 0;
    for (const itemId of selectedItems) {
      try {
        await deleteIndentItem(itemId);
        successCount++;
      } catch (err) {
        console.error(err);
      }
    }
    toast.success(`${successCount} item${successCount !== 1 ? 's' : ''} deleted successfully`);
    setSelectedItems(new Set());
    setDeletingSelected(false);
    loadItems();
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
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${subTab === 'pending'
              ? 'bg-primary/10 text-primary'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
          >
            <Clock size={14} />
            Pending
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${subTab === 'pending' ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-500'
              }`}>
              {pendingItems.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setSubTab('history'); setCurrentPage(1); setSelectedItems(new Set()); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${subTab === 'history'
              ? 'bg-primary/10 text-primary'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
          >
            <History size={14} />
            History
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${subTab === 'history' ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-500'
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

        <FilterMenu
          activeCount={[indentFilter, productFilter, vendorFilter].filter(Boolean).length}
          onClear={() => { setIndentFilter(''); setProductFilter(''); setVendorFilter(''); }}
        >
          <select
            value={indentFilter}
            onChange={e => setIndentFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full"
          >
            <option value="">-- All Indents --</option>
            {indentOptions.map(num => (
              <option key={num} value={num}>{num}</option>
            ))}
          </select>

          <select
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full"
          >
            <option value="">-- All Products --</option>
            {productOptions.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            value={vendorFilter}
            onChange={e => setVendorFilter(e.target.value)}
            className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full"
          >
            <option value="">-- All Vendors --</option>
            {indentVendorOptions.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </FilterMenu>

        {(searchTerm || indentFilter || productFilter || vendorFilter) && (
          <Button variant="outline" size="sm" onClick={() => { setSearchTerm(''); setIndentFilter(''); setProductFilter(''); setVendorFilter(''); }}
            className="h-9 text-xs border-slate-200 hover:bg-slate-50 shrink-0">
            Clear
          </Button>
        )}

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => { setViewMode('card'); localStorage.setItem('purchase_view_mode', 'card'); }}
            className={`px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1 text-xs font-medium ${viewMode === 'card' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            title="Card View"
          >
            <LayoutGrid size={14} />
            <span className="hidden sm:inline">Cards</span>
          </button>
          <button
            type="button"
            onClick={() => { setViewMode('table'); localStorage.setItem('purchase_view_mode', 'table'); }}
            className={`px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1 text-xs font-medium ${viewMode === 'table' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            title="Table View"
          >
            <LayoutList size={14} />
            <span className="hidden sm:inline">Table</span>
          </button>
        </div>

        {selectedCount > 0 && (
          <Button size="sm" variant="outline" onClick={handleDeleteSelected} disabled={deletingSelected || savingAll}
            className="gap-1.5 text-xs h-9 w-full sm:w-auto shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
            {deletingSelected ? (
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-red-600" />
            ) : (
              <Trash2 size={14} />
            )}
            Delete Selected ({selectedCount})
          </Button>
        )}

        <Button size="sm" onClick={saveAllSelected} disabled={savingAll || selectedCount === 0}
          className="gap-1.5 text-xs h-9 w-full sm:w-auto shrink-0">
          {savingAll ? (
            <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
          ) : (
            <Save size={14} />
          )}
          Save Selected
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 flex flex-col flex-1 min-h-0">
          {/* ── Sub-header bar with Select All Checkbox & Count (same as Sales Dispatch Planning) ── */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex-wrap shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-600">
                {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
              </span>
              {selectedCount > 0 && (
                <span className="text-primary font-semibold">({selectedCount} selected)</span>
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
            <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50">
              {isEmpty ? (
                <div className="p-12 text-center">
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
                <div className="flex flex-col gap-2">
                  {currentItems.map(item => {
                    const indent = item.purchase_indents || {};
                    const hasDecision = !!edits[item.item_id]?.approval_action;
                    const selected = selectedItems.has(item.item_id);
                    const isExpanded = expandedPlanIds.has(item.item_id);
                    const vendorId = getValue(item, 'vendor_id');
                    const selectedVendor = vendors.find(v => String(v.vendor_id) === String(vendorId));
                    const vendorName = selectedVendor?.name || item.approved_vendor?.name || item.item_vendor?.name || '';
                    const totalQty = Number(item.indent_qty ?? item.quantity ?? 0);
                    const apprQty = getApprovedQtyPreview(item);
                    const rateVal = Number(item.rate || 0);

                    return (
                      <div
                        key={item.item_id}
                        className={`bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all overflow-hidden flex flex-col border-l-[3.5px] ${
                          hasDecision ? 'border-l-emerald-500' : 'border-l-indigo-500'
                        } ${selected ? 'ring-2 ring-primary/20 border-primary' : ''}`}
                      >
                        {/* Main Compact 1-Card Row */}
                        <div className="py-2.5 px-3.5 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
                          {/* Left Column: Checkbox, Status Badge, Indent No, Date */}
                          <div className="flex items-center gap-2.5 shrink-0 min-w-[155px]">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSelect(item.item_id)}
                              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5"
                            />
                            <div className="flex flex-col gap-1">
                              <div>
                                {hasDecision ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 leading-none">
                                    <Check size={10} className="stroke-[3]" /> Decided
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 leading-none">
                                    <Clock size={10} className="stroke-[2.5]" /> Pending Planning
                                  </span>
                                )}
                              </div>
                              <div className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight">
                                {indent.indent_number || '—'}
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium whitespace-nowrap leading-none">
                                <Calendar size={11} className="text-slate-400 shrink-0" />
                                <span>Date: {indent.indent_date ? format(new Date(indent.indent_date), 'dd MMM yyyy') : '—'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Vertical Divider */}
                          <div className="hidden xl:block w-px self-stretch bg-slate-200/70 my-0.5" />

                          {/* Middle Column: Product Avatar, Name, Packaging, Metadata */}
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
                                  {indent.process_type && (
                                    <IndentTypeBadge processType={indent.process_type} />
                                  )}
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 leading-none">
                                    Raw Material
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 font-medium leading-tight">
                                  {item.products?.packaging_size ? `${item.products.packaging_size} Kg` : (item.products?.unit || '')}
                                </div>
                              </div>
                            </div>

                            {/* Metadata Row: Vendor, Rate, Exp Date */}
                            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px]">
                              <div className="flex items-center gap-1 text-slate-600">
                                <User size={12} className="text-slate-400 shrink-0" />
                                <span className="text-slate-400">Vendor:</span>
                                <span className="font-medium text-slate-700 truncate max-w-[140px]" title={vendorName}>{vendorName || 'Not selected'}</span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-600">
                                <span className="text-slate-400">Rate:</span>
                                <span className="font-semibold text-slate-800">₹{rateVal.toFixed(2)}</span>
                              </div>
                              {item.planning_date && (
                                <div className="flex items-center gap-1 text-slate-600">
                                  <Calendar size={12} className="text-slate-400 shrink-0" />
                                  <span className="text-slate-400">Exp Delivery:</span>
                                  <span className="font-medium text-slate-700">{format(new Date(item.planning_date), 'dd/MM/yyyy')}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Middle-Right: Quantities Box with Progress Bar */}
                          <div className="py-1.5 px-3 rounded-lg border flex flex-col justify-between gap-1.5 min-w-[190px] sm:min-w-[210px] shrink-0 bg-indigo-50/50 border-indigo-200/70">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded bg-white/90 border border-slate-200/60 flex items-center justify-center shrink-0">
                                  <Package size={11} className="text-indigo-600" />
                                </div>
                                <span className="font-bold text-slate-900 text-xs">
                                  {apprQty || totalQty} / {totalQty} {item.products?.unit || 'Kg'}
                                </span>
                              </div>
                              <span className="text-[10px] font-semibold text-indigo-700 leading-none">
                                {hasDecision ? 'Planned' : 'Unplanned'}
                              </span>
                            </div>

                            <div className="w-full h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                                style={{ width: `${hasDecision ? 100 : 30}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-slate-500 leading-none">
                              <span>Total: <strong className="text-slate-800">{totalQty}</strong></span>
                              <span>Approved: <strong className="text-indigo-700">{apprQty || '—'}</strong></span>
                            </div>
                          </div>

                          {/* Right Column: Actions (Configure Drawer Toggle & Delete) */}
                          <div className="flex items-center justify-end xl:justify-center gap-1.5 shrink-0">
                            <Button
                              variant={isExpanded ? 'secondary' : 'outline'}
                              size="sm"
                              type="button"
                              onClick={() => toggleExpandPlan(item.item_id)}
                              className={`h-7 px-2.5 text-xs font-semibold gap-1 rounded-md transition-all ${
                                isExpanded ? 'bg-slate-200 text-slate-800' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                              }`}
                            >
                              <span>{isExpanded ? 'Hide Form' : 'Plan / Edit'}</span>
                              <ChevronDown size={13} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              title="Delete Row"
                              onClick={() => handleDeleteRow(item)}
                              className="p-1 h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </div>

                        {/* Collapsible Planning Drawer */}
                        {isExpanded && (
                          <div className="px-3.5 py-3 bg-slate-50/80 border-t border-slate-100 flex flex-col gap-2.5 animate-in fade-in duration-150">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-1">Vendor</label>
                                <Dropdown
                                  value={getValue(item, 'vendor_id')}
                                  onValueChange={(v) => setEditValue(item.item_id, 'vendor_id', v)}
                                  options={vendorOptions}
                                  placeholder="Select vendor..."
                                  searchPlaceholder="Search vendors..."
                                  align="start"
                                  className="h-7 text-xs w-full bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-1">Approve Unit</label>
                                <select
                                  disabled={subTab === 'history'}
                                  value={getValue(item, 'approve_unit')}
                                  onChange={(e) => handleApproveUnitChange(item, e.target.value)}
                                  className="w-full h-7 text-xs px-2 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                                >
                                  <option value="bag">BAG</option>
                                  <option value="kg">KG</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-1">Qty</label>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Qty"
                                  disabled={subTab === 'history'}
                                  value={getValue(item, 'approve_unit_qty')}
                                  onChange={(e) => setEditValue(item.item_id, 'approve_unit_qty', sanitizeQtyInput(e.target.value))}
                                  className="h-7 text-xs font-semibold text-center bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-1">Status</label>
                                <Dropdown
                                  value={getValue(item, 'approval_action')}
                                  onValueChange={(v) => setEditValue(item.item_id, 'approval_action', v)}
                                  options={STATUS_OPTIONS}
                                  placeholder="Select status..."
                                  disabled={subTab === 'history'}
                                  align="start"
                                  className="h-7 text-xs w-full bg-white"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-200/50">
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Rate (₹)</label>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  disabled={subTab === 'history'}
                                  value={getValue(item, 'rate')}
                                  onChange={(e) => {
                                    let val = e.target.value.replace(/[^0-9.]/g, '');
                                    const parts = val.split('.');
                                    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                                    setEditValue(item.item_id, 'rate', val);
                                  }}
                                  className="h-7 text-xs bg-white font-medium"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Exp. Delivery Date</label>
                                <Input
                                  type="date"
                                  disabled={subTab === 'history'}
                                  value={getValue(item, 'planning_date')}
                                  onChange={(e) => setEditValue(item.item_id, 'planning_date', e.target.value)}
                                  className="h-7 text-xs bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Approval Remarks</label>
                                <Input
                                  type="text"
                                  placeholder="Remarks..."
                                  disabled={subTab === 'history'}
                                  value={getValue(item, 'approval_remarks')}
                                  onChange={(e) => setEditValue(item.item_id, 'approval_remarks', e.target.value)}
                                  className="h-7 text-xs bg-white"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0">
              <table className="w-full text-sm">
                <thead className="bg-blue-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="w-16 px-2 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                          title="Select all"
                        />
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Action</span>
                      </div>
                    </th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent No.</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Qty</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Approve Unit</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Qty</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wider whitespace-nowrap">Approve Qty</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Rate</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Vendor Name</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Expected Delivery Date</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Remarks</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Approval Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isEmpty && (
                    <tr>
                      <td colSpan="14" className="p-12 text-center">
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
                        <td className="px-2 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSelect(item.item_id)}
                              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              title="Delete Row"
                              onClick={() => handleDeleteRow(item)}
                              className="p-1 h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center font-medium text-slate-800 whitespace-nowrap">
                          {indent.indent_number || '—'}
                        </td>
                        <td className="px-3 py-3 text-center text-slate-500 whitespace-nowrap text-xs">
                          {indent.indent_date ? format(new Date(indent.indent_date), 'dd/MM/yyyy') : '—'}
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <span className="text-slate-700 font-medium">{item.products?.name || '—'}</span>{' '}
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">{item.products?.unit || '—'}</span>
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-slate-500 font-medium whitespace-nowrap">
                          {item.indent_qty ?? item.quantity ?? '—'}
                        </td>
                        <td className="px-3 py-3">
                          <select
                            disabled={subTab === 'history'}
                            value={getValue(item, 'approve_unit')}
                            onChange={(e) => handleApproveUnitChange(item, e.target.value)}
                            className="w-full h-8 text-xs px-2 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                          >
                            <option value="bag">BAG</option>
                            <option value="kg">KG</option>
                          </select>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="w-20 mx-auto">
                            <Input type="text" inputMode="decimal" placeholder="Qty"
                              disabled={subTab === 'history'}
                              value={getValue(item, 'approve_unit_qty')}
                              onChange={(e) => setEditValue(item.item_id, 'approve_unit_qty', sanitizeQtyInput(e.target.value))}
                              className="h-8 text-xs font-semibold text-center" />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center font-semibold text-emerald-600 tabular-nums">
                          {getApprovedQtyPreview(item) || <span className="text-slate-300">—</span>}
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
      </div>
      );
};

      export default VendorSelectionTable;
