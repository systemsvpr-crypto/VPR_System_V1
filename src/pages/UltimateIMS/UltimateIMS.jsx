import { useState, useEffect, useMemo } from 'react';
import { Search, Boxes, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { getAllProductStock, getAllProducts, getAllGodowns } from '../../services/masterService';
import { getReorderStatusItems, createIndent, generateNextIndentNumber } from '../../services/purchaseService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { sanitizeQtyInput } from '@/lib/qty';

const PAGE_SIZE_OPTIONS = [50, 100, 200];

const getTodayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatNum = (n) => {
  const val = Number(n) || 0;
  return val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

// Deliveries land here once the transporter/vendor has actually dropped the
// stock at a godown — anything else (In Transit, At TPT Gdn, ...) is still
// moving, so it counts toward "In Transit Qty" instead of "received".
const isReceivedStatus = (status) => status === 'Arrived' || status === 'Received';

/**
 * Live purchase-pipeline view, one row per Product + Godown: current stock
 * next to exactly how much of that product is still pending approval,
 * already approved, on the road, or outstanding overall — everything an
 * indent needs to be raised for, in one screen.
 */
const UltimateIMS = () => {
  const { user } = useAuthStore();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [godownFilter, setGodownFilter] = useState('');
  const [godowns, setGodowns] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  // Row selection gates the Reorder Qty input — checking a row is what makes
  // it editable, per the "only enabled once selected" requirement.
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [reorderQty, setReorderQty] = useState({});

  // "Save" raises one Indent (+ one item per selected row, qty = its Reorder
  // Qty) straight from this dashboard — it lands in Purchase > Indent >
  // Pending exactly like any other indent, just without a vendor picked yet
  // (that still happens later, per item, on Vendor Approval).
  const [indentDate, setIndentDate] = useState(getTodayLocal());
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, godownFilter, pageSize]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [stockRows, products, godownList, indentItems] = await Promise.all([
        getAllProductStock(),
        getAllProducts(),
        getAllGodowns(),
        getReorderStatusItems(),
      ]);
      setGodowns(godownList);

      const productMap = new Map(products.map((p) => [p.product_id, p]));
      const godownMap = new Map(godownList.map((g) => [g.godown_id, g]));

      // One group per Product
      const groups = new Map();

      for (const p of products) {
        groups.set(p.product_id, {
          key: p.product_id,
          productId: p.product_id,
          godownStats: new Map(),
        });
      }

      const getGodownStats = (productId, godownId) => {
        if (!groups.has(productId)) {
          groups.set(productId, {
            key: productId, productId,
            godownStats: new Map(),
          });
        }
        const group = groups.get(productId);
        if (!group.godownStats.has(godownId)) {
          group.godownStats.set(godownId, {
            godownId,
            currentStock: 0, pendingApprovalQty: 0, approvedQty: 0,
            inTransitQty: 0, totalOrderedQty: 0, totalReceivedQty: 0,
            orderPendingQty: 0
          });
        }
        return group.godownStats.get(godownId);
      };

      for (const s of stockRows) {
        if (!s.product_id || !s.godown_id) continue;
        getGodownStats(s.product_id, s.godown_id).currentStock += Number(s.current_stock) || 0;
      }

      for (const item of indentItems) {
        if (!item.product_id) continue;
        // Items still awaiting a godown pick (e.g. sitting in Vendor
        // Approval before approval, or a Reorder raised with "All Godowns")
        // have no approved_godown_id yet — bucket those under "Unassigned"
        // instead of dropping them, or their qty would never appear in any
        // pipeline column (Approval Pending/Approved/In Transit/Order
        // Pending), no matter what happens to the item afterward.
        const indentGodownId = item.approved_godown_id || 'unassigned';

        const isDirect = item.purchase_indents?.process_type === 'direct';
        const isApproved = isDirect || item.approval_status === 'Approved';
        
        const qty = Number(item.quantity) || 0;
        let totalDeliveredForThisItem = 0;
        
        for (const d of item.purchase_deliveries || []) {
          const dq = Number(d.received_quantity) || 0;
          totalDeliveredForThisItem += dq;
          const isRecv = isReceivedStatus(d.status);

          const allocations = d.purchase_delivery_godowns || [];
          if (allocations.length > 0) {
            for (const alloc of allocations) {
              const allocQty = Number(alloc.qty) || 0;
              const s = getGodownStats(item.product_id, alloc.godown_id);
              if (isRecv) s.totalReceivedQty += allocQty;
              else s.inTransitQty += allocQty;
            }
          } else {
            const s = getGodownStats(item.product_id, indentGodownId);
            if (isRecv) s.totalReceivedQty += dq;
            else s.inTransitQty += dq;
          }
        }

        const stats = getGodownStats(item.product_id, indentGodownId);
        stats.totalOrderedQty += qty;
        
        // purchase_indents has no vendor_id column — the only real vendor
        // link for an item is approved_vendor_id (set once approved).
        const hasVendor = Boolean(item.approved_vendor_id);
        
        if (!isApproved) {
          stats.pendingApprovalQty += qty;
        } else {
          const remainingForDelivery = Math.max(0, qty - totalDeliveredForThisItem);
          if (hasVendor) {
            stats.approvedQty += remainingForDelivery;
          } else {
            stats.orderPendingQty += remainingForDelivery;
          }
        }
      }

      const built = Array.from(groups.values()).map((g) => {
        const statsArray = Array.from(g.godownStats.values()).map(st => ({
          ...st,
          godownName: godownMap.get(st.godownId)?.name || 'Unassigned Godown',
        }));
        return {
          key: g.productId,
          productId: g.productId,
          productName: productMap.get(g.productId)?.name || 'Unassigned Product',
          unit: productMap.get(g.productId)?.unit || '—',
          stats: statsArray
        };
      }).sort((a, b) => a.productName.localeCompare(b.productName));

      setRows(built);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load live purchase data');
    }
    setLoading(false);
  };

  const ownGodowns = useMemo(() =>
    godowns.filter((g) => (g.godown_type || 'Own') === 'Own'),
    [godowns],
  );

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    
    return rows.map(r => {
      const filteredStats = godownFilter 
          ? r.stats.filter(st => String(st.godownId) === godownFilter)
          : r.stats;
      return { ...r, filteredStats };
    }).filter(r => {
      const matchSearch = !term ||
        r.productName.toLowerCase().includes(term) ||
        r.filteredStats.some(st => st.godownName.toLowerCase().includes(term));
      return matchSearch;
    }).map(r => {
      const totals = {
        currentStock: 0, pendingApprovalQty: 0, approvedQty: 0,
        inTransitQty: 0, totalOrderedQty: 0, totalReceivedQty: 0,
        orderPendingQty: 0
      };
      for (const st of r.filteredStats) {
         totals.currentStock += st.currentStock;
         totals.pendingApprovalQty += st.pendingApprovalQty;
         totals.approvedQty += st.approvedQty;
         totals.inTransitQty += st.inTransitQty;
         totals.totalOrderedQty += st.totalOrderedQty;
         totals.totalReceivedQty += st.totalReceivedQty;
         totals.orderPendingQty += (st.orderPendingQty || 0);
      }
      return {
          ...r,
          ...totals
      };
    });
  }, [rows, searchTerm, godownFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const toggleSelect = (key) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setReorderQtyValue = (key, value) => {
    setReorderQty((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveIndent = async () => {
    if (selectedRows.size === 0) {
      toast.error('Select at least one product row.');
      return;
    }
    if (!indentDate) {
      toast.error('Select an order date.');
      return;
    }

    const items = [];
    for (const key of selectedRows) {
      const qty = Number(reorderQty[key]);
      if (!qty || qty <= 0) {
        const row = rows.find((r) => r.key === key);
        toast.error(`${row?.productName || 'Selected product'}: enter a valid reorder qty.`);
        return;
      }
      items.push({ product_id: key, quantity: qty, rate: 0 });
    }

    setSaving(true);
    try {
      const indent_number = await generateNextIndentNumber();
      await createIndent({
        indent_date: indentDate,
        indent_number,
        // Reorder is raised straight off the selected product rows — no
        // godown/vendor picked here; those get decided per item later, on
        // Vendor Approval. The page's own godown filter is display-only.
        godown_id: godownFilter || null,
        vendor_id: null,
        remarks: '',
        items,
        created_by: user?.user_id,
        process_type: 'process',
      });
      toast.success(`Indent ${indent_number} created with ${items.length} item(s). See Purchase > Indent > Pending.`);
      setSelectedRows(new Set());
      setReorderQty({});
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to create indent.');
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
          <Input type="text" placeholder="Search product or godown..." className="pl-9"
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <select
          value={godownFilter}
          onChange={(e) => setGodownFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[160px]"
        >
          <option value="">All Godowns</option>
          {ownGodowns.map((g) => (
            <option key={g.godown_id} value={String(g.godown_id)}>{g.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
          {selectedRows.size > 0 && (
            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-md whitespace-nowrap shrink-0">
              {selectedRows.size} selected
            </span>
          )}
          <div className="w-40 shrink-0">
            <DatePicker value={indentDate} onChange={(e) => setIndentDate(e.target.value)} placeholder="Order date" className="h-9" />
          </div>
          <Button onClick={handleSaveIndent} disabled={saving || selectedRows.size === 0}
            className="gap-1.5 h-9 px-4 text-xs font-medium shrink-0">
            {saving ? (
              <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
            ) : (
              <Save size={14} />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 flex flex-col flex-1 min-h-0">
        <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0 flex flex-col">
          <table className="w-full text-xs relative">
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr className="bg-blue-50 border-b border-slate-200">
                <th className="w-10 px-2 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Action</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[180px]">Product Name</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Unit</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">Current Stock</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider whitespace-nowrap min-w-[110px]">Reorder Qty</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-amber-600 uppercase tracking-wider whitespace-nowrap min-w-[120px]">Approval Pending Purchase Qty</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wider whitespace-nowrap">Approval Qty</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-violet-600 uppercase tracking-wider whitespace-nowrap">In Transit Qty</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wider whitespace-nowrap">Order Pending Qty</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[130px]">Godown Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
                    <p className="text-sm text-slate-400">Loading live purchase data...</p>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                      <Boxes size={32} className="text-slate-300" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-600 mb-1">No Stock Lines Found</h3>
                    <p className="text-sm text-slate-400">
                      {searchTerm || godownFilter ? 'No rows match your search/filter.' : 'No stock or purchase activity recorded yet.'}
                    </p>
                  </td>
                </tr>
              ) : (
                  currentRows.map((row) => {
                    const selected = selectedRows.has(row.key);
                    return (
                      <tr key={row.key} className={`hover:bg-slate-50/80 transition-colors ${selected ? 'bg-primary/5' : ''}`}>
                        <td className="px-2 py-3 text-center">
                          <input type="checkbox" checked={selected} onChange={() => toggleSelect(row.key)}
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-slate-800 whitespace-nowrap">{row.productName}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">{row.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatNum(row.currentStock)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="w-24 mx-auto">
                            <Input type="text" inputMode="decimal" placeholder="Qty"
                              disabled={!selected}
                              value={reorderQty[row.key] ?? ''}
                              onChange={(e) => setReorderQtyValue(row.key, sanitizeQtyInput(e.target.value))}
                              className="h-8 text-xs text-center" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-amber-600 tabular-nums whitespace-nowrap">
                          {row.pendingApprovalQty > 0 ? formatNum(row.pendingApprovalQty) : <span className="text-slate-300">0</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-emerald-600 tabular-nums whitespace-nowrap">
                          {row.approvedQty > 0 ? formatNum(row.approvedQty) : <span className="text-slate-300">0</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-violet-600 tabular-nums whitespace-nowrap">
                          {row.inTransitQty > 0 ? formatNum(row.inTransitQty) : <span className="text-slate-300">0</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-red-600 tabular-nums whitespace-nowrap">
                          {row.orderPendingQty > 0 ? formatNum(row.orderPendingQty) : <span className="text-slate-300">0</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col gap-1 w-[120px] mx-auto">
                            {row.filteredStats.filter(g => g.currentStock !== 0 || g.pendingApprovalQty > 0 || g.approvedQty > 0 || g.inTransitQty > 0 || g.totalOrderedQty > 0).length > 0 ? (
                              row.filteredStats
                                .filter(g => g.currentStock !== 0 || g.pendingApprovalQty > 0 || g.approvedQty > 0 || g.inTransitQty > 0 || g.totalOrderedQty > 0)
                                .sort((a, b) => b.currentStock - a.currentStock)
                                .map((g) => (
                                  <div key={g.godownId} className="flex items-center justify-between gap-2 text-[11px] leading-tight border-b border-slate-100 last:border-0 pb-1 last:pb-0">
                                    <span className="truncate text-slate-500 font-medium text-left" title={g.godownName}>{g.godownName}</span>
                                    <span className="font-semibold text-slate-700 text-right">{formatNum(g.currentStock)}</span>
                                  </div>
                                ))
                            ) : (
                              <span className="text-xs text-slate-400">No stock</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
              )}
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
              {filteredRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length} lines
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

export default UltimateIMS;
