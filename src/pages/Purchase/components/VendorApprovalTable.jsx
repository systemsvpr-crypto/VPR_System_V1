import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ShoppingCart, ChevronDown, ChevronLeft, ChevronRight, CheckCircle, CheckCheck, Zap, ArrowRightLeft, Trash2, LayoutGrid, LayoutList } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getIndentsForApproval, approveIndentItem, deleteIndent, deleteIndentItem } from '../../../services/purchaseService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { sanitizeQtyInput } from '@/lib/qty';

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

const VendorApprovalTable = ({ vendors, godowns, user }) => {
  const [indents, setIndents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [expandedIndents, setExpandedIndents] = useState(new Set());
  const [approvingId, setApprovingId] = useState(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('purchase_view_mode') || 'card');
  const [deleting, setDeleting] = useState(false);

  const [edits, setEdits] = useState({});

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, pageSize]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getIndentsForApproval();
      setIndents(data);
    } catch {
      toast.error('Failed to load indents for approval');
      setIndents([]);
    }
    setLoading(false);
  };

  const vendorOptions = useMemo(() =>
    vendors.map(v => ({ value: v.vendor_id, label: v.name })),
    [vendors],
  );

  const activeGodowns = useMemo(() =>
    godowns.filter(g => g.is_active).map(g => ({ value: g.godown_id, label: g.name })),
    [godowns],
  );

  const toggleExpand = (indentId) => {
    setExpandedIndents(prev => {
      const next = new Set(prev);
      if (next.has(indentId)) next.delete(indentId);
      else next.add(indentId);
      return next;
    });
  };

  const filteredIndents = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return indents.filter(indent => {
      if (!term) return true;
      return (
        indent.indent_number?.toLowerCase().includes(term) ||
        indent.vendors?.name?.toLowerCase().includes(term) ||
        (indent.purchase_indent_items || []).some(item =>
          item.products?.name?.toLowerCase().includes(term)
        )
      );
    });
  }, [indents, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredIndents.length / pageSize));
  const currentIndents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredIndents.slice(start, start + pageSize);
  }, [filteredIndents, currentPage, pageSize]);

  const allItems = useMemo(() =>
    indents.flatMap(i => i.purchase_indent_items || []),
    [indents],
  );

  const getItemValue = useCallback((item, field) => {
    const edit = edits[item.item_id];
    if (edit && edit[field] !== undefined) return edit[field];
    if (field === 'vendor_id') return item.vendor_id || item.purchase_indents?.vendor_id || '';
    if (field === 'godown_id') return item.approved_godown_id || item.purchase_indents?.godown_id || '';
    if (field === 'rate') return String(item.rate ?? '');
    if (field === 'quantity') return String(item.quantity ?? '');
    return '';
  }, [edits]);

  const setEditValue = (itemId, field, value) => {
    setEdits(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const hasItemChanges = (item) => {
    const edit = edits[item.item_id];
    if (!edit) return false;
    return edit.vendor_id !== undefined || edit.rate !== undefined ||
      edit.quantity !== undefined || edit.godown_id !== undefined;
  };

  const resetItem = (itemId) => {
    setEdits(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const approveItem = async (item) => {
    const edit = edits[item.item_id];
    const payload = { approved_by: user?.user_id || null, vendor_remarks: item.vendor_remarks };
    if (edit?.vendor_id !== undefined) payload.vendor_id = edit.vendor_id;
    if (edit?.rate !== undefined) payload.rate = Number(edit.rate);
    if (edit?.quantity !== undefined) payload.quantity = Number(edit.quantity);
    if (edit?.godown_id !== undefined) payload.godown_id = edit.godown_id;

    setApprovingId(item.item_id);
    try {
      await approveIndentItem(item.item_id, payload);
      toast.success('Item approved');
      setIndents(prev => prev.map(indent => ({
        ...indent,
        purchase_indent_items: (indent.purchase_indent_items || []).map(i =>
          i.item_id === item.item_id
            ? {
                ...i,
                approval_status: 'Approved',
                ...(payload.vendor_id ? { approved_vendor_id: payload.vendor_id } : {}),
                ...(payload.rate ? { approved_rate: payload.rate } : {}),
                ...(payload.quantity ? { quantity: payload.quantity } : {}),
                ...(payload.godown_id ? { approved_godown_id: payload.godown_id } : {}),
                approved_remarks: payload.vendor_remarks,
              }
            : i
        ),
      })));
      resetItem(item.item_id);
      setSelectedItems(prev => {
        const next = new Set(prev);
        next.delete(item.item_id);
        return next;
      });
    } catch (err) {
      toast.error(err.message || 'Failed to approve');
    }
    setApprovingId(null);
  };

  const toggleSelect = (itemId) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleSelectAll = (items) => {
    const unapprovedIds = items.filter(i => i.approval_status !== 'Approved').map(i => i.item_id);
    if (unapprovedIds.every(id => selectedItems.has(id))) {
      setSelectedItems(prev => {
        const next = new Set(prev);
        unapprovedIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedItems(prev => {
        const next = new Set(prev);
        unapprovedIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const allCurrentUnapprovedItems = currentIndents.flatMap(i => i.purchase_indent_items || []).filter(i => i.approval_status !== 'Approved');
  const allCurrentUnapprovedIds = allCurrentUnapprovedItems.map(i => i.item_id);
  const allSelectedOnPage = allCurrentUnapprovedIds.length > 0 && allCurrentUnapprovedIds.every(id => selectedItems.has(id));

  const toggleSelectAllOnPage = () => {
    if (allSelectedOnPage) {
      setSelectedItems(prev => {
        const next = new Set(prev);
        allCurrentUnapprovedIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedItems(prev => {
        const next = new Set(prev);
        allCurrentUnapprovedIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const selectedCount = selectedItems.size;

  const approveAllSelected = async () => {
    const allCurrentItems = currentIndents.flatMap(i => i.purchase_indent_items || []);
    const toApprove = allCurrentItems.filter(i => selectedItems.has(i.item_id) && i.approval_status !== 'Approved');
    if (toApprove.length === 0) { toast.error('No unapproved items selected.'); return; }
    setApprovingAll(true);
    let approved = 0;
    // Only an item that actually approves drops out of selection — one that
    // fails (e.g. a save error) stays checked with its edits untouched, so
    // the user doesn't have to re-select it after fixing the problem.
    const approvedIds = new Set();
    for (const item of toApprove) {
      const edit = edits[item.item_id];
      const payload = { approved_by: user?.user_id || null, vendor_remarks: item.vendor_remarks };
      if (edit?.vendor_id !== undefined) payload.vendor_id = edit.vendor_id;
      if (edit?.rate !== undefined) payload.rate = Number(edit.rate);
      if (edit?.quantity !== undefined) payload.quantity = Number(edit.quantity);
      if (edit?.godown_id !== undefined) payload.godown_id = edit.godown_id;
      try {
        await approveIndentItem(item.item_id, payload);
        approved++;
        approvedIds.add(item.item_id);
        setIndents(prev => prev.map(indent => ({
          ...indent,
          purchase_indent_items: (indent.purchase_indent_items || []).map(i =>
            i.item_id === item.item_id
              ? { ...i, approval_status: 'Approved', ...(payload.vendor_id ? { approved_vendor_id: payload.vendor_id } : {}), ...(payload.rate ? { approved_rate: payload.rate } : {}), ...(payload.quantity ? { quantity: payload.quantity } : {}), ...(payload.godown_id ? { approved_godown_id: payload.godown_id } : {}), approved_remarks: payload.vendor_remarks }
              : i
          ),
        })));
        resetItem(item.item_id);
      } catch (err) {
        toast.error(`Failed to approve item: ${err.message}`);
      }
    }
    setApprovingAll(false);
    setSelectedItems(prev => { const next = new Set(prev); approvedIds.forEach(id => next.delete(id)); return next; });
    if (approved > 0) toast.success(`${approved} item${approved !== 1 ? 's' : ''} approved`);
  };

  const handleDeleteIndent = async (indent) => {
    const iNum = indent.indent_number || 'this indent';
    if (!window.confirm(`Permanently delete indent "${iNum}" and all its items? This cannot be undone.`)) return;
    try {
      await deleteIndent(indent.indent_id);
      toast.success('Indent deleted');
      setIndents(prev => prev.filter(i => i.indent_id !== indent.indent_id));
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete indent');
    }
  };

  const handleDeleteItem = async (item) => {
    const pName = item.products?.name || 'this item';
    if (!window.confirm(`Permanently delete "${pName}"? This cannot be undone.`)) return;
    try {
      await deleteIndentItem(item.item_id);
      toast.success('Item deleted');
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete item');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedCount === 0) { toast.error('No items selected.'); return; }
    if (!window.confirm(`Permanently delete ${selectedCount} selected item${selectedCount !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setDeleting(true);
    let count = 0;
    for (const itemId of selectedItems) {
      try {
        await deleteIndentItem(itemId);
        count++;
      } catch (err) {
        console.error(err);
      }
    }
    toast.success(`${count} item${count !== 1 ? 's' : ''} deleted successfully`);
    setSelectedItems(new Set());
    setDeleting(false);
    loadData();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading indents for approval...</p>
      </div>
    );
  }



  return (
    <>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative w-full sm:flex-1 sm:min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
          <Input type="text" placeholder="Search indent no., vendor, product..." className="pl-9 h-9 w-full"
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => { setViewMode('card'); localStorage.setItem('purchase_view_mode', 'card'); }}
            className={`px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1 text-xs font-medium ${
              viewMode === 'card' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Card View"
          >
            <LayoutGrid size={14} />
            <span className="hidden sm:inline">Cards</span>
          </button>
          <button
            type="button"
            onClick={() => { setViewMode('table'); localStorage.setItem('purchase_view_mode', 'table'); }}
            className={`px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1 text-xs font-medium ${
              viewMode === 'table' ? 'bg-white text-primary shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Table View"
          >
            <LayoutList size={14} />
            <span className="hidden sm:inline">Table</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0">
        {/* ── Sub-header bar with Select All Checkbox & Count (same as Sales Dispatch Planning) ── */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex-wrap shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600">
              {filteredIndents.length} indent{filteredIndents.length !== 1 ? 's' : ''}
            </span>
            {selectedCount > 0 && (
              <span className="text-primary font-semibold">({selectedCount} items selected)</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {allCurrentUnapprovedItems.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allSelectedOnPage}
                  onChange={toggleSelectAllOnPage}
                  className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                />
                <span>Select All</span>
              </label>
            )}
            {selectedCount > 0 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedItems(new Set())}
                  className="text-xs h-7">
                  Clear
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeleteSelected} disabled={deleting || approvingAll}
                  className="gap-1 text-xs h-7 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
                  {deleting ? <div className="animate-spin rounded-full h-3 w-3 border-t border-b border-red-600" /> : <Trash2 size={13} />}
                  Delete Selected ({selectedCount})
                </Button>
                <Button size="sm" onClick={approveAllSelected} disabled={approvingAll || deleting}
                  className="gap-1 text-xs h-7">
                  {approvingAll ? (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
                  ) : (
                    <CheckCircle size={13} />
                  )}
                  Approve Selected
                </Button>
              </div>
            )}
          </div>
        </div>

        {viewMode === 'card' ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50">
            {filteredIndents.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <ShoppingCart size={32} className="text-slate-300" />
                </div>
                <h3 className="text-base font-semibold text-slate-600 mb-1">No Indents for Approval</h3>
                <p className="text-sm text-slate-400">
                  {searchTerm
                    ? 'No indents match your search criteria.'
                    : 'Mark items as "Planned" in Vendor Approval to see them here for approval.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-4">
                {currentIndents.map(indent => {
                  const items = indent.purchase_indent_items || [];
                  const isExpanded = expandedIndents.has(indent.indent_id);
                  const allApproved = items.length > 0 && items.every(i => i.approval_status === 'Approved');
                  const hasSelectedItems = items.some(i => selectedItems.has(i.item_id));

                  return (
                    <div
                      key={indent.indent_id}
                      className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 ${
                        hasSelectedItems ? 'ring-2 ring-primary/20 border-primary' : ''
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {items.some(i => i.approval_status !== 'Approved') && (
                            <input
                              type="checkbox"
                              checked={items.filter(i => i.approval_status !== 'Approved').every(i => selectedItems.has(i.item_id))}
                              onChange={() => toggleSelectAll(items)}
                              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer mt-0.5"
                            />
                          )}
                          <div>
                            <div className="font-semibold text-slate-800 text-sm">{indent.indent_number || '—'}</div>
                            <div className="text-xs text-slate-500 truncate max-w-[180px]">
                              {indent.vendors?.name || '—'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <IndentTypeBadge processType={indent.process_type} />
                          {allApproved && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              Approved
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            title="Delete Indent"
                            onClick={() => handleDeleteIndent(indent)}
                            className="p-1 h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>

                      {/* Summary Info (2-col grid like DispatchPlanningTable) */}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                        <div><span className="text-slate-400">Date:</span> <span className="text-slate-700">{indent.indent_date ? format(new Date(indent.indent_date), 'dd/MM/yyyy') : '—'}</span></div>
                        <div><span className="text-slate-400">Godown:</span> <span className="text-slate-700">{indent.godowns?.name || '—'}</span></div>
                        <div><span className="text-slate-400">Products:</span> <span className="font-semibold text-primary">{items.length} items</span></div>
                        <div><span className="text-slate-400">Total Amt:</span> <span className="font-bold text-slate-900">₹{Number(indent.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                      </div>

                      {/* Toggle Expand Items */}
                      <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => toggleExpand(indent.indent_id)}
                          className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 cursor-pointer"
                        >
                          <ChevronDown size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          {isExpanded ? 'Hide Items' : `View Items (${items.length})`}
                        </button>
                      </div>

                      {/* Expanded Items */}
                      {isExpanded && items.length > 0 && (
                        <div className="space-y-2 pt-1 border-t border-slate-100">
                          {items.map(item => {
                            const approved = item.approval_status === 'Approved';
                            const changed = hasItemChanges(item);
                            const approving = approvingId === item.item_id;
                            const selected = selectedItems.has(item.item_id);

                            return (
                              <div
                                key={item.item_id}
                                className={`p-2.5 rounded-lg border text-xs flex flex-col gap-2 ${
                                  selected ? 'bg-primary/5 border-primary/30' : 'bg-slate-50/70 border-slate-200'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    {!approved && (
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() => toggleSelect(item.item_id)}
                                        className="w-3.5 h-3.5 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                                      />
                                    )}
                                    <span className="font-semibold text-slate-900">{item.products?.name}</span>
                                    <span className="text-[10px] text-slate-400 uppercase">({item.products?.unit})</span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    type="button"
                                    title="Delete Item"
                                    onClick={() => handleDeleteItem(item)}
                                    className="p-1 h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                  >
                                    <Trash2 size={12} />
                                  </Button>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-[10px] text-slate-400 block">Qty:</span>
                                    {approved ? (
                                      <span className="font-semibold text-slate-700">{item.quantity}</span>
                                    ) : (
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={getItemValue(item, 'quantity')}
                                        onChange={(e) => setEditValue(item.item_id, 'quantity', sanitizeQtyInput(e.target.value))}
                                        className="h-7 text-xs font-semibold"
                                      />
                                    )}
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-slate-400 block">Rate (₹):</span>
                                    {approved ? (
                                      <span className="font-semibold text-slate-700">₹{item.rate}</span>
                                    ) : (
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={getItemValue(item, 'rate')}
                                        onChange={(e) => {
                                          let val = e.target.value.replace(/[^0-9.]/g, '');
                                          const parts = val.split('.');
                                          if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                                          setEditValue(item.item_id, 'rate', val);
                                        }}
                                        className="h-7 text-xs font-semibold"
                                      />
                                    )}
                                  </div>
                                </div>

                                {!approved && (
                                  <div className="flex justify-end pt-1">
                                    <Button
                                      size="sm"
                                      onClick={() => handleApproveSingle(item)}
                                      disabled={approving}
                                      className="h-7 text-xs gap-1 px-3"
                                    >
                                      {approving ? <div className="animate-spin rounded-full h-3 w-3 border-t border-b border-white" /> : <CheckCircle size={12} />}
                                      {changed ? 'Save & Approve' : 'Approve'}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="bg-blue-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="w-10 px-2 py-3" />
                  <th className="w-10 px-2 py-3">
                    {filteredIndents.some(i => (i.purchase_indent_items || []).some(it => it.approval_status !== 'Approved')) && (
                      <input type="checkbox"
                        checked={(() => {
                          const all = filteredIndents.flatMap(i => i.purchase_indent_items || []).filter(it => it.approval_status !== 'Approved');
                          return all.length > 0 && all.every(it => selectedItems.has(it.item_id));
                        })()}
                        onChange={() => toggleSelectAll(filteredIndents.flatMap(i => i.purchase_indent_items || []))}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                    )}
                  </th>
                  <th className="w-14 text-center px-2 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Action</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Indent No.</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Indent Type</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendor</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Godown</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Items</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredIndents.length === 0 && (
                  <tr>
                    <td colSpan="10" className="p-12 text-center">
                      <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                        <ShoppingCart size={32} className="text-slate-300" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-600 mb-1">No Indents for Approval</h3>
                      <p className="text-sm text-slate-400">
                        {searchTerm
                          ? 'No indents match your search criteria.'
                          : 'Mark items as "Planned" in Vendor Approval to see them here for approval.'}
                      </p>
                    </td>
                  </tr>
                )}
                {currentIndents.flatMap(indent => {
                  const items = indent.purchase_indent_items || [];
                  const isExpanded = expandedIndents.has(indent.indent_id);
                  const allApproved = items.every(i => i.approval_status === 'Approved');
                  const rows = [
                    <tr key={indent.indent_id}
                      className={`hover:bg-slate-50 transition-colors group cursor-pointer ${allApproved ? 'bg-green-50/30' : ''}`}
                      onClick={() => toggleExpand(indent.indent_id)}>
                      <td className="px-2 py-3">
                        <ChevronDown size={16}
                          className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                      </td>
                      <td className="px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {items.some(i => i.approval_status !== 'Approved') && (
                          <input type="checkbox"
                            checked={items.filter(i => i.approval_status !== 'Approved').every(i => selectedItems.has(i.item_id))}
                            onChange={() => toggleSelectAll(items)}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                        )}
                      </td>
                      <td className="px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          title="Delete Indent"
                          onClick={() => handleDeleteIndent(indent)}
                          className="p-1.5 h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-800">{indent.indent_number || '—'}</td>
                      <td className="px-3 py-3 text-slate-500 text-xs">
                        {indent.indent_date ? format(new Date(indent.indent_date), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <IndentTypeBadge processType={indent.process_type} />
                      </td>
                      <td className="px-3 py-3 text-slate-600">{indent.vendors?.name || '—'}</td>
                      <td className="px-3 py-3 text-slate-600">{indent.godowns?.name || '—'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {items.length}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-slate-800">
                        ₹{Number(indent.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ];
                  if (isExpanded && items.length > 0) {
                    rows.push(
                      <tr key={`${indent.indent_id}-details`}>
                        <td colSpan={10} className="px-0 py-0">
                          <div className="bg-slate-50 border-t border-slate-100">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-200">
                                  <th className="w-10 px-2 py-2" />
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Product</th>
                                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Qty</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rate</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Vendor</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Godown</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                                  <th className="w-24 px-3 py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {items.map(item => {
                                  const approved = item.approval_status === 'Approved';
                                  const changed = hasItemChanges(item);
                                  const approving = approvingId === item.item_id;
                                  const selected = selectedItems.has(item.item_id);
                                  return (
                                    <tr key={item.item_id}
                                      className={`hover:bg-white transition-colors ${approved ? 'opacity-70' : ''} ${selected ? 'bg-primary/5' : ''}`}>
                                      <td className="px-2 py-2.5 text-center">
                                        {!approved && (
                                          <input type="checkbox"
                                            checked={selected}
                                            onChange={() => toggleSelect(item.item_id)}
                                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <span className="text-slate-700 font-medium">{item.products?.name || '—'}</span>
                                        <span className="text-xs text-slate-400 ml-1 uppercase">({item.products?.unit})</span>
                                      </td>
                                      <td className="px-3 py-2.5 text-center">
                                        {approved ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                                            {item.quantity}
                                          </span>
                                        ) : (
                                          <div className="w-20 mx-auto">
                                            <Input type="text" inputMode="decimal" placeholder="Qty"
                                              value={getItemValue(item, 'quantity')}
                                              onChange={(e) => setEditValue(item.item_id, 'quantity', sanitizeQtyInput(e.target.value))}
                                              className="h-7 text-xs text-center" />
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 text-slate-600">
                                        {approved ? (
                                          `₹${item.rate}`
                                        ) : (
                                          <div className="w-20">
                                            <Input type="text" inputMode="decimal" placeholder="Rate"
                                              value={getItemValue(item, 'rate')}
                                              onChange={(e) => {
                                                let val = e.target.value.replace(/[^0-9.]/g, '');
                                                const parts = val.split('.');
                                                if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                                                setEditValue(item.item_id, 'rate', val);
                                              }}
                                              className="h-7 text-xs" />
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 min-w-[140px]">
                                        {approved ? (
                                          <span className="text-slate-700">
                                            {vendors.find(v => v.vendor_id === item.approved_vendor_id)?.name || vendors.find(v => v.vendor_id === item.vendor_id)?.name || '—'}
                                          </span>
                                        ) : (
                                          <Dropdown value={getItemValue(item, 'vendor_id')}
                                            onValueChange={(v) => setEditValue(item.item_id, 'vendor_id', v)}
                                            options={vendorOptions} placeholder="Select vendor..."
                                            align="start" />
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 min-w-[130px]">
                                        {approved ? (
                                          <span className="text-slate-700">
                                            {godowns.find(g => g.godown_id === item.approved_godown_id)?.name || godowns.find(g => g.godown_id === item.godown_id)?.name || '—'}
                                          </span>
                                        ) : (
                                          <Dropdown value={getItemValue(item, 'godown_id')}
                                            onValueChange={(v) => setEditValue(item.item_id, 'godown_id', v)}
                                            options={activeGodowns} placeholder="Select godown..."
                                            align="start" />
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                          approved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                                        }`}>
                                          {approved ? 'Approved' : 'Pending'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          {!approved && (
                                            <Button size="sm" onClick={() => handleApproveSingle(item)}
                                              disabled={approving}
                                              className="gap-1 text-xs h-7 px-2.5">
                                              {approving ? (
                                                <div className="animate-spin rounded-full h-3 w-3 border-t border-b border-white" />
                                              ) : (
                                                <CheckCircle size={12} />
                                              )}
                                              {changed ? 'Save & Approve' : 'Approve'}
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            type="button"
                                            title="Delete Item"
                                            onClick={() => handleDeleteItem(item)}
                                            className="p-1 h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                          >
                                            <Trash2 size={13} />
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return rows;
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
              {filteredIndents.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, filteredIndents.length)} of {filteredIndents.length} indents
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
    </>
  );
};

const SearchIcon = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
);

export default VendorApprovalTable;
