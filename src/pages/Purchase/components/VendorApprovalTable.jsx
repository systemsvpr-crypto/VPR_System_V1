import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ShoppingCart, ChevronDown, CheckCircle, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getIndentsForApproval, approveIndentItem } from '../../../services/purchaseService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import Pagination from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 10;

const VendorApprovalTable = ({ vendors, godowns }) => {
  const [indents, setIndents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedIndents, setExpandedIndents] = useState(new Set());
  const [approvingId, setApprovingId] = useState(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());

  const [edits, setEdits] = useState({});

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

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

  const totalPages = Math.max(1, Math.ceil(filteredIndents.length / ITEMS_PER_PAGE));
  const currentIndents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredIndents.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredIndents, currentPage]);

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
    const payload = {};
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
                ...(payload.vendor_id ? { vendor_id: payload.vendor_id } : {}),
                ...(payload.rate ? { rate: payload.rate } : {}),
                ...(payload.quantity ? { quantity: payload.quantity } : {}),
                ...(payload.godown_id ? { approved_godown_id: payload.godown_id } : {}),
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

  const selectedCount = selectedItems.size;

  const approveAllSelected = async () => {
    const allCurrentItems = currentIndents.flatMap(i => i.purchase_indent_items || []);
    const toApprove = allCurrentItems.filter(i => selectedItems.has(i.item_id) && i.approval_status !== 'Approved');
    if (toApprove.length === 0) { toast.error('No unapproved items selected.'); return; }
    setApprovingAll(true);
    let approved = 0;
    for (const item of toApprove) {
      const edit = edits[item.item_id];
      const payload = {};
      if (edit?.vendor_id !== undefined) payload.vendor_id = edit.vendor_id;
      if (edit?.rate !== undefined) payload.rate = Number(edit.rate);
      if (edit?.quantity !== undefined) payload.quantity = Number(edit.quantity);
      if (edit?.godown_id !== undefined) payload.godown_id = edit.godown_id;
      try {
        await approveIndentItem(item.item_id, payload);
        approved++;
        setIndents(prev => prev.map(indent => ({
          ...indent,
          purchase_indent_items: (indent.purchase_indent_items || []).map(i =>
            i.item_id === item.item_id
              ? { ...i, approval_status: 'Approved', ...(payload.vendor_id ? { vendor_id: payload.vendor_id } : {}), ...(payload.rate ? { rate: payload.rate } : {}), ...(payload.quantity ? { quantity: payload.quantity } : {}), ...(payload.godown_id ? { approved_godown_id: payload.godown_id } : {}) }
              : i
          ),
        })));
        resetItem(item.item_id);
      } catch (err) {
        toast.error(`Failed to approve item: ${err.message}`);
      }
    }
    setApprovingAll(false);
    setSelectedItems(new Set());
    if (approved > 0) toast.success(`${approved} item${approved !== 1 ? 's' : ''} approved`);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading indents for approval...</p>
      </div>
    );
  }

  if (filteredIndents.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <ShoppingCart size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Indents for Approval</h3>
        <p className="text-sm text-slate-400">
          {searchTerm
            ? 'No indents match your search criteria.'
            : 'Mark items as "Planned" in Vendor Selection to see them here for approval.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
          <input type="text" placeholder="Search indent no., vendor, product..."
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground"
          />
        </div>
        <span className="text-xs text-slate-400 font-medium">{filteredIndents.length} indent{filteredIndents.length !== 1 ? 's' : ''}</span>
      </div>

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
              <Button size="sm" onClick={approveAllSelected} disabled={approvingAll}
                className="gap-1.5 text-xs h-8">
                {approvingAll ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
                ) : (
                  <CheckCircle size={14} />
                )}
                Approve Selected
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
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
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Indent No.</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendor</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Godown</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Items</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
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
                    <td className="px-3 py-3 font-medium text-slate-800">{indent.indent_number || '—'}</td>
                    <td className="px-3 py-3 text-slate-500 text-xs">
                      {indent.indent_date ? format(new Date(indent.indent_date), 'dd/MM/yyyy') : '—'}
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
                      <td colSpan={8} className="px-0 py-0">
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
                                          <Input type="number" step="1" min="1" placeholder="Qty"
                                            value={getItemValue(item, 'quantity')}
                                            onChange={(e) => setEditValue(item.item_id, 'quantity', e.target.value.replace(/\D/g, ''))}
                                            className="h-7 text-xs text-center" />
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      {approved ? (
                                        <span className="text-slate-600">₹{Number(item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                      ) : (
                                        <div className="w-24">
                                          <Input type="number" step="0.01" min="0" placeholder="Rate"
                                            value={getItemValue(item, 'rate')}
                                            onChange={(e) => setEditValue(item.item_id, 'rate', e.target.value)}
                                            className="h-7 text-xs" />
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2.5 min-w-[140px]">
                                      {approved ? (
                                        <span className="text-slate-600 text-xs">{item.item_vendor?.name || vendors.find(v => v.vendor_id === item.vendor_id)?.name || '—'}</span>
                                      ) : (
                                        <Dropdown value={getItemValue(item, 'vendor_id')}
                                          onValueChange={(v) => setEditValue(item.item_id, 'vendor_id', v)}
                                          options={vendorOptions} placeholder="Vendor..."
                                          searchPlaceholder="Search vendors..." align="start" />
                                      )}
                                    </td>
                                    <td className="px-3 py-2.5 min-w-[140px]">
                                      {approved ? (
                                        <span className="text-slate-600 text-xs">{godowns.find(g => g.godown_id === (item.approved_godown_id || indent.godown_id))?.name || '—'}</span>
                                      ) : (
                                        <Dropdown value={getItemValue(item, 'godown_id')}
                                          onValueChange={(v) => setEditValue(item.item_id, 'godown_id', v)}
                                          options={activeGodowns} placeholder="Godown..."
                                          searchPlaceholder="Search godowns..." align="start" />
                                      )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                        approved
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                          : 'bg-slate-100 text-slate-500 border-slate-200'
                                      }`}>
                                        {approved ? 'Approved' : 'Pending'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                      {approved ? (
                                        <CheckCircle size={18} className="text-emerald-400 mx-auto" />
                                      ) : (
                                        <div className="flex items-center justify-center gap-1">
                                          <Button size="sm" type="button"
                                            disabled={approving}
                                            onClick={() => approveItem(item)}
                                            className="gap-1 text-xs h-7 px-2.5">
                                            {approving ? (
                                              <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-white" />
                                            ) : (
                                              <CheckCircle size={13} />
                                            )}
                                            Approve
                                          </Button>
                                          {changed && (
                                            <button type="button"
                                              onClick={() => resetItem(item.item_id)}
                                              className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                              title="Reset edits">
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                            </button>
                                          )}
                                        </div>
                                      )}
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

        {filteredIndents.length > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredIndents.length}
            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, filteredIndents.length)}
            onPageChange={setCurrentPage}
            className="border-t border-slate-200"
          />
        )}
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
