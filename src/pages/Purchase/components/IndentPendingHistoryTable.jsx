import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Save, ShoppingCart, Clock, History as HistoryIcon, Zap, ArrowRightLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAllIndentItems, updateVendorSelection } from '../../../services/purchaseService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dropdown } from '@/components/ui/dropdown';
import { sanitizeQtyInput } from '@/lib/qty';

const PAGE_SIZE_OPTIONS = [50, 100, 200];

/* ─── indent type badge — same convention as the old Indent table ── */
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

// One product line's position within its own indent ("1, 2, 3...n" when an
// indent has multiple products) — built from the full raw item list so the
// number stays the same for a given item regardless of sort/filter/page.
const buildItemNoMap = (allItems) => {
  const byIndent = new Map();
  allItems.forEach(it => {
    const indentNo = it.purchase_indents?.indent_number || '—';
    if (!byIndent.has(indentNo)) byIndent.set(indentNo, []);
    byIndent.get(indentNo).push(it);
  });
  const map = new Map();
  byIndent.forEach(list => {
    [...list]
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
      .forEach((it, idx) => map.set(it.item_id, idx + 1));
  });
  return map;
};

/**
 * Indent page — Pending / History.
 *
 * Reuses the exact same data + save pipeline as Vendor Approval
 * (purchase_indent_items.planning_status / updateVendorSelection) so nothing
 * about that workflow changes — this is just a second, item-level view of it
 * scoped to the Indent page, that also includes Direct-type items (which are
 * auto-approved/Planned right at creation, so they land straight in History).
 */
const IndentPendingHistoryTable = ({ vendors = [], user, refreshToken, toolbarExtra, searchTerm = '', onSearchChange }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('pending'); // 'pending' | 'history'
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  const [selectedItems, setSelectedItems] = useState(new Set());
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

  // Reloads on mount, and again whenever the Indent page creates/edits/bulk-
  // uploads an indent (Purchase.jsx bumps refreshToken after its own
  // loadData() succeeds) — so a newly created indent's items show up here
  // without needing a manual page refresh.
  useEffect(() => { loadItems(); }, [refreshToken]);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, subTab, pageSize]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await getAllIndentItems();
      setItems(data || []);
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

  const itemNoMap = useMemo(() => buildItemNoMap(items), [items]);

  const pendingItems = useMemo(() =>
    items.filter(i => i.planning_status !== 'Planned'),
    [items],
  );
  const historyItems = useMemo(() =>
    items.filter(i => i.planning_status === 'Planned'),
    [items],
  );

  const baseList = subTab === 'pending' ? pendingItems : historyItems;

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return baseList;
    return baseList.filter(item => {
      const indent = item.purchase_indents || {};
      return (
        indent.indent_number?.toLowerCase().includes(term) ||
        item.products?.name?.toLowerCase().includes(term) ||
        indent.vendors?.name?.toLowerCase().includes(term)
      );
    });
  }, [baseList, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const getValue = useCallback((item, field) => {
    const edit = edits[item.item_id];
    if (edit && edit[field] !== undefined) return edit[field];
    if (field === 'vendor_id') return item.vendor_id || item.purchase_indents?.vendor_id || '';
    if (field === 'rate') return item.rate ? String(item.rate) : '';
    if (field === 'quantity') return String(item.quantity ?? '');
    if (field === 'planning_date') return item.planning_date || '';
    if (field === 'vendor_remarks') return item.vendor_remarks || '';
    return '';
  }, [edits]);

  // The *first* time Vendor or Expected Delivery Date is set while multiple
  // rows are checked, it fills in every other checked row too — a
  // convenience for planning a batch of rows the same way in one go (one
  // indent is usually one vendor, one delivery date). But once any row in
  // that selection already has its own value for the field (i.e. the batch
  // has already been filled, or someone typed different values into
  // different rows), further edits only apply to the one row being edited —
  // so a row can be corrected individually afterwards without dragging the
  // rest of the selection along with it.
  //
  // Rate, Approved Qty, and Remarks never broadcast this way (see
  // setItemField below) — those are per-product and almost always differ
  // row to row, even on the first edit.
  const setFieldForSelected = (item, field, value) => {
    setEdits(prev => {
      const targets = new Set(selectedItems);
      targets.add(item.item_id);
      const alreadyDiverged = Array.from(targets).some(id => prev[id]?.[field] !== undefined);
      const next = { ...prev };
      if (alreadyDiverged) {
        next[item.item_id] = { ...next[item.item_id], [field]: value };
      } else {
        targets.forEach(id => { next[id] = { ...next[id], [field]: value }; });
      }
      return next;
    });
  };

  // Rate and Approved Qty are per-product, never shared across rows — even
  // on the very first edit — since two different products on the same
  // indent almost always have different rates/quantities. Always scoped to
  // just the row being edited, unlike Vendor/Date above.
  const setItemField = (item, field, value) => {
    setEdits(prev => ({ ...prev, [item.item_id]: { ...prev[item.item_id], [field]: value } }));
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
    const ids = currentItems.map(i => i.item_id);
    const allSelected = ids.length > 0 && ids.every(id => selectedItems.has(id));
    if (allSelected) {
      setSelectedItems(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    } else {
      setSelectedItems(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
    }
  };

  const selectedCount = selectedItems.size;

  const saveSelected = async () => {
    if (selectedCount === 0) { toast.error('No rows selected.'); return; }
    setSaving(true);
    // Only rows that actually save drop out of selection/edits — a row that
    // fails validation (or the API call itself) stays checked with whatever
    // was typed still in place, so the user just fixes that one field and
    // retries instead of redoing the whole row.
    const savedIds = new Set();
    for (const itemId of selectedItems) {
      const item = items.find(i => i.item_id === itemId);
      if (!item) continue;
      const edit = edits[itemId] || {};
      const label = item.purchase_indents?.indent_number || itemId;

      // approval_status / approved_by are deliberately not set here — this
      // screen is planning (choosing vendor/rate/qty/date), not the final
      // approval sign-off. That's a separate, later step on the Approval tab.
      const payload = {
        vendor_id: edit.vendor_id !== undefined ? edit.vendor_id : (item.vendor_id || item.purchase_indents?.vendor_id || null),
        approved_godown_id: item.approved_godown_id || item.purchase_indents?.godown_id || null,
        rate: edit.rate !== undefined ? Number(edit.rate) : Number(item.rate || 0),
        quantity: edit.quantity !== undefined ? Number(edit.quantity) : Number(item.quantity || 0),
        planning_date: edit.planning_date !== undefined ? edit.planning_date : item.planning_date,
        vendor_remarks: edit.vendor_remarks !== undefined ? edit.vendor_remarks : item.vendor_remarks,
        planning_status: 'Planned',
      };

      if (!payload.vendor_id) { toast.error(`${label}: select a vendor.`); continue; }
      if (!payload.rate) { toast.error(`${label}: enter a rate.`); continue; }
      if (!payload.quantity || payload.quantity <= 0) { toast.error(`${label}: enter a valid approved qty.`); continue; }
      if (!payload.planning_date) { toast.error(`${label}: select an expected delivery date.`); continue; }

      try {
        await updateVendorSelection(itemId, payload);
        savedIds.add(itemId);
      } catch (err) {
        toast.error(`Failed for ${label}: ${err.message}`);
      }
    }
    setSaving(false);
    setSelectedItems(prev => { const next = new Set(prev); savedIds.forEach(id => next.delete(id)); return next; });
    setEdits(prev => { const next = { ...prev }; savedIds.forEach(id => { delete next[id]; }); return next; });
    if (savedIds.size > 0) {
      toast.success(`${savedIds.size} item${savedIds.size !== 1 ? 's' : ''} saved.`);
      await loadItems();
    }
  };

  const isEmpty = filteredItems.length === 0;

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Everything in one wrapping row: indent-level filters/actions (passed
          in from Purchase.jsx) + Pending/History toggle + search + Save. */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex items-center gap-1 shrink-0">
          {[
            { id: 'pending', label: 'Pending', icon: Clock, count: pendingItems.length },
            { id: 'history', label: 'History', icon: HistoryIcon, count: historyItems.length },
          ].map(f => (
            <button key={f.id} type="button"
              onClick={() => { setSubTab(f.id); setSelectedItems(new Set()); setEdits({}); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                subTab === f.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}>
              <f.icon size={14} />
              {f.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                subTab === f.id ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-500'
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:flex-1 sm:min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
          <Input type="text" placeholder="Search indent no., product, vendor..." className="pl-9 h-9 w-full"
            value={searchTerm} onChange={(e) => onSearchChange?.(e.target.value)} />
        </div>

        {toolbarExtra}

        {subTab === 'pending' && (
          <Button size="sm" onClick={saveSelected} disabled={saving || selectedCount === 0}
            className="gap-1.5 text-xs h-9 w-full sm:w-auto sm:ml-auto shrink-0">
            {saving ? (
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
            ) : (
              <Save size={14} />
            )}
            Save
          </Button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading indent items...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col flex-1 min-h-0">
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0">
            <table className="w-full text-sm relative">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="bg-blue-50 border-b border-slate-200">
                  {subTab === 'pending' && (
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox"
                        checked={currentItems.length > 0 && currentItems.every(i => selectedItems.has(i.item_id))}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                    </th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent Number</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Indent Type</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Items</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[180px]">Product Name</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Unit</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">Indent Qty</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider whitespace-nowrap min-w-[160px]">Vendor Name</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider whitespace-nowrap min-w-[100px]">Rate</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider whitespace-nowrap min-w-[100px]">Approved Qty</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider whitespace-nowrap min-w-[150px]">Expected Delivery Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[130px]">Remarks</th>
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
                          ? 'No items match your search.'
                          : subTab === 'pending'
                          ? 'All indent items have been approved.'
                          : 'Approved indent items will appear here.'}
                      </p>
                    </td>
                  </tr>
                )}
                {currentItems.map(item => {
                  const indent = item.purchase_indents || {};
                  const selected = selectedItems.has(item.item_id);
                  const vendorName = vendors.find(v => v.vendor_id === item.vendor_id)?.name
                    || indent.vendors?.name || '—';
                  return (
                    <tr key={item.item_id} className={`hover:bg-slate-50 transition-colors ${selected ? 'bg-primary/5' : ''}`}>
                      {subTab === 'pending' && (
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selected} onChange={() => toggleSelect(item.item_id)}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                        </td>
                      )}
                      <td className="px-4 py-3 text-slate-600">
                        {indent.indent_date ? format(new Date(indent.indent_date), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{indent.indent_number || '—'}</td>
                      <td className="px-4 py-3 text-center"><IndentTypeBadge processType={indent.process_type} /></td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {itemNoMap.get(item.item_id) || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800">{item.products?.name || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">{item.products?.unit || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-slate-800">
                        {/* indent_qty is the originally-requested amount — quantity
                            itself becomes the Approved Qty once this item is planned,
                            so this column has to read from indent_qty to stay accurate.
                            Falls back to quantity for rows saved before that column existed. */}
                        {item.indent_qty ?? item.quantity ?? '—'}
                      </td>

                      {subTab === 'pending' ? (
                        <>
                          <td className="px-4 py-3 min-w-[160px]">
                            <Dropdown value={getValue(item, 'vendor_id')}
                              onValueChange={(v) => setFieldForSelected(item, 'vendor_id', v)}
                              options={vendorOptions} placeholder="Select vendor..."
                              searchPlaceholder="Search vendors..." align="start"
                              disabled={!selected} className="h-8 text-xs" />
                          </td>
                          <td className="px-4 py-3">
                            <Input type="text" inputMode="decimal" placeholder="Rate"
                              disabled={!selected}
                              value={getValue(item, 'rate')}
                              onChange={(e) => {
                                let val = e.target.value.replace(/[^0-9.]/g, '');
                                const parts = val.split('.');
                                if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                                setItemField(item, 'rate', val);
                              }}
                              className="h-8 text-xs text-center" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="w-20 mx-auto">
                              <Input type="text" inputMode="decimal" placeholder="Qty"
                                disabled={!selected}
                                value={getValue(item, 'quantity')}
                                onChange={(e) => setItemField(item, 'quantity', sanitizeQtyInput(e.target.value))}
                                className="h-8 text-xs text-center" />
                            </div>
                          </td>
                          <td className="px-4 py-3 min-w-[150px]">
                            <DatePicker value={getValue(item, 'planning_date')}
                              disabled={!selected}
                              onChange={(e) => setFieldForSelected(item, 'planning_date', e.target.value)}
                              placeholder="Select date..." className="h-8 text-xs" />
                          </td>
                          <td className="px-4 py-3 min-w-[130px]">
                            <Input type="text" placeholder="Remarks"
                              disabled={!selected}
                              value={getValue(item, 'vendor_remarks')}
                              onChange={(e) => setItemField(item, 'vendor_remarks', e.target.value)}
                              className="h-8 text-xs" />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-slate-700 font-medium">{vendorName}</td>
                          <td className="px-4 py-3 text-center text-slate-600 tabular-nums">
                            {item.rate ? `₹${Number(item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-emerald-600 tabular-nums">{item.quantity ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {item.planning_date ? format(new Date(item.planning_date), 'dd/MM/yyyy') : '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{item.vendor_remarks || '—'}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="shrink-0 px-4 py-3 border-t border-slate-100 bg-blue-50 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-b-xl">
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
      )}
    </div>
  );
};

export default IndentPendingHistoryTable;
