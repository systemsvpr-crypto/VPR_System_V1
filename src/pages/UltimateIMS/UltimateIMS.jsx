import { useState, useEffect, useMemo } from 'react';
import { Search, Boxes, ChevronLeft, ChevronRight, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';
import { updateProductPlanning } from '../../services/masterService';
import { createIndent, generateNextIndentNumber } from '../../services/purchaseService';
import { fetchImsRows, sumImsStats, getMaxLevel, getStockLevel, STOCK_LEVEL_STYLES } from '@/lib/imsData';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { sanitizeQtyInput, roundQty } from '@/lib/qty';
import { canEditOrDelete } from '../../lib/permissions';
import TableScrollSync from '@/components/TableScrollSync';

const PAGE_SIZE_OPTIONS = [50, 100, 200];

const getTodayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatNum = (n) => {
  const val = Number(n) || 0;
  return val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};


// Bag <-> Kg conversion. Reorder Qty is entered in whichever unit the row's
// Reorder Unit dropdown is set to (`fromUnit`, defaulting to the product's
// master unit) — whichever of Bag/Kg matches that entry unit just mirrors
// Reorder Qty as-is, the other is derived via this row's own Pkg/Bag figure.
const convertReorderQty = (qty, fromUnit, targetUnit, pkgSize) => {
  const amount = Number(qty) || 0;
  const mux = Number(pkgSize) || 0;
  const from = (fromUnit || '').toLowerCase();
  const target = (targetUnit || from).toLowerCase();
  if (!from || target === from) return amount;
  if (from === 'bag' && target === 'kg') return mux > 0 ? amount * mux : amount;
  if (from === 'kg' && target === 'bag') return mux > 0 ? amount / mux : amount;
  return amount;
};


/**
 * Live purchase-pipeline view, one row per Product + Godown: current stock
 * next to exactly how much of that product is still pending approval,
 * already approved, on the road, or outstanding overall — everything an
 * indent needs to be raised for, in one screen.
 */
const UltimateIMS = () => {
  const { user } = useAuthStore();
  const canModify = canEditOrDelete(user);
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
  // Reorder Unit defaults to the product's own master unit per row — this
  // state only holds rows where the user actually switched it.
  const [reorderUnit, setReorderUnit] = useState({});
  // Unit picked in the Unit column header — applies to every row at once.
  const [bulkUnit, setBulkUnit] = useState('');
  // Unsaved Lead Time / Safety Factor typed on a checked row, keyed by
  // product — each field saves to the product master on blur.
  const [planningEdits, setPlanningEdits] = useState({});

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
      const { rows: built, godowns: godownList } = await fetchImsRows();
      setGodowns(godownList);
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
        (r.unit && r.unit.toLowerCase().includes(term)) ||
        r.filteredStats.some(st => st.godownName.toLowerCase().includes(term));
      return matchSearch;
    }).map(r => {
      return { ...r, ...sumImsStats(r.filteredStats) };
    })
      // With a godown picked, list only products that have stock there or
      // stock on its way there (order pending, approval pending, approved
      // or in transit) — products with nothing at all in that godown are
      // left out.
      .filter(r => !godownFilter || r.currentStock !== 0 ||
        r.orderPendingQty > 0 || r.pendingApprovalQty > 0 || r.approvedQty > 0 || r.inTransitQty > 0 || r.atTptQty > 0);
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

  const getReorderUnitValue = (row) => reorderUnit[row.key] || (row.unit || '').toLowerCase();

  // Live preview of the master-unit qty Reorder Unit/Qty currently convert
  // to, using this product's real Pkg/Bag figure (Master > Product's Mux —
  // e.g. "32 Kg" — parsed via getPackagingSize, never a hardcoded number).
  // Kept at up to 2 decimal places, same as everywhere else quantities are
  // stored — Indent Qty is allowed to be fractional (e.g. a Kg-unit product
  // reordered as 3.56 Kg stays 3.56, it's never forced to a whole number).
  const getReorderActualQty = (row) => {
    const rawQty = reorderQty[row.key];
    if (rawQty === undefined || rawQty === '') return null;
    const masterUnit = (row.unit || '').toLowerCase();
    const unit = getReorderUnitValue(row);
    return roundQty(convertReorderQty(rawQty, unit, masterUnit, row.packagingSize));
  };

  // Switching Reorder Unit re-bases whatever Reorder Qty is currently
  // showing into the newly picked unit (e.g. 20 bags becomes 640 when
  // switching to Kg) so a stale number typed in the old unit doesn't linger
  // under a new one.
  const handleReorderUnitChange = (row, newUnit) => {
    const currentUnit = getReorderUnitValue(row);
    const currentQty = reorderQty[row.key] ?? '';
    const requantified = convertReorderQty(currentQty, currentUnit, newUnit, row.packagingSize);
    setReorderUnit((prev) => ({ ...prev, [row.key]: newUnit }));
    setReorderQty((prev) => ({ ...prev, [row.key]: requantified ? String(roundQty(requantified)) : '' }));
  };

  // Header Unit dropdown: sets every row to the same unit, re-basing any
  // Reorder Qty already typed (same as switching each row individually).
  const handleBulkUnitChange = (newUnit) => {
    setBulkUnit(newUnit);
    if (!newUnit) return;
    const nextUnit = {};
    const nextQty = { ...reorderQty };
    rows.forEach((row) => {
      const currentQty = reorderQty[row.key];
      if (currentQty !== undefined && currentQty !== '') {
        const requantified = convertReorderQty(currentQty, getReorderUnitValue(row), newUnit, row.packagingSize);
        nextQty[row.key] = requantified ? String(roundQty(requantified)) : '';
      }
      nextUnit[row.key] = newUnit;
    });
    setReorderUnit(nextUnit);
    setReorderQty(nextQty);
  };

  const getPlanningValue = (row, field) => {
    const edit = planningEdits[row.key]?.[field];
    if (edit !== undefined) return edit;
    return field === 'lead_time' ? row.leadTime : row.safetyFactor;
  };

  const setPlanningValue = (key, field, value) => {
    setPlanningEdits((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  // Saves Lead Time / Safety Factor to the product master when the input
  // loses focus (only if it actually changed).
  const handlePlanningBlur = async (row, field) => {
    if (!canModify) {
      toast.error('You do not have permission to modify product planning parameters');
      return;
    }
    const value = planningEdits[row.key]?.[field];
    if (value === undefined) return;
    const label = field === 'lead_time' ? 'Lead Time' : 'Safety Factor';
    const saved = field === 'lead_time' ? row.leadTime : row.safetyFactor;
    const clearEdit = () => setPlanningEdits((prev) => {
      const next = { ...prev, [row.key]: { ...prev[row.key] } };
      delete next[row.key][field];
      return next;
    });
    if (String(value).trim() === String(saved ?? '').trim()) { clearEdit(); return; }
    if (String(value).trim() !== '' && (isNaN(Number(value)) || Number(value) < 0)) {
      toast.error(`${label} must be a valid non-negative number.`);
      return;
    }
    try {
      await updateProductPlanning(row.productId, { [field]: value });
      const stored = String(value).trim() === '' ? '' : Number(value);
      setRows((prev) => prev.map((r) => (r.key !== row.key ? r : {
        ...r,
        ...(field === 'lead_time' ? { leadTime: stored } : { safetyFactor: stored }),
      })));
      clearEdit();
      toast.success(`${row.productName}: ${label} saved`);
    } catch (err) {
      toast.error(err.message || 'Failed to save.');
    }
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
      const row = rows.find((r) => r.key === key);
      const rawQty = Number(reorderQty[key]);
      if (!rawQty || rawQty <= 0) {
        toast.error(`${row?.productName || 'Selected product'}: enter a valid reorder qty.`);
        return;
      }
      const masterUnit = (row?.unit || '').toLowerCase();
      const unit = row ? getReorderUnitValue(row) : masterUnit;
      // quantity always has to be in the product's real master unit,
      // regardless of which unit the Reorder Qty was actually typed in.
      // Kept at up to 2 decimal places (not forced to a whole number) —
      // Indent Qty is allowed to be fractional; whole-number rounding only
      // has to happen later, right before a qty is actually posted to
      // transactions (which has the chk_qty_integer constraint) — Delivery
      // and Aawak already round independently at that point.
      const masterQty = roundQty(convertReorderQty(rawQty, unit, masterUnit, row?.packagingSize));
      if (!masterQty || masterQty <= 0) {
        toast.error(`${row?.productName || 'Selected product'}: enter a valid reorder qty.`);
        return;
      }
      items.push({
        product_id: key,
        group_id: row?.groupId || null,
        quantity: masterQty,
        rate: 0,
        reorder_unit: unit,
        reorder_unit_qty: rawQty,
      });
    }

    setSaving(true);
    try {
      const indent_number = await generateNextIndentNumber();
      const headerGroupId = items.find(i => i.group_id)?.group_id || null;
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
        group_id: headerGroupId,
      });
      toast.success(`Indent ${indent_number} created with ${items.length} item(s). See Purchase > Indent > Pending.`);
      setSelectedRows(new Set());
      setReorderQty({});
      setReorderUnit({});
      setBulkUnit('');
      await loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to create indent.');
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-6 shrink-0 pb-2">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={18} />
          <Input
            type="text"
            placeholder="Search product or godown..."
            className="pl-9 pr-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X size={14} />
            </button>
          )}
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

      <div className="bg-white rounded-xl border border-slate-200 flex flex-col flex-1">
        <TableScrollSync className="flex-1 min-h-0" scrollClassName="flex-1 flex flex-col">
          <table className="w-full text-xs relative">
            <thead className="sticky top-0 z-10 shadow-sm">
              <tr className="bg-blue-50 border-b border-slate-200">
                {/* Action + Product Name stay pinned while scrolling sideways */}
                <th className="sticky left-0 z-20 bg-blue-50 w-16 min-w-16 px-2 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Action</th>
                <th className="sticky left-16 z-20 bg-blue-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[180px]">Product Name</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">Current Stock</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Unit</span>
                    <select
                      value={bulkUnit}
                      onChange={(e) => handleBulkUnitChange(e.target.value)}
                      title="Set unit for all rows"
                      className="h-6 text-[10px] font-semibold px-1 rounded border border-slate-300 bg-white text-slate-700 normal-case focus:outline-none focus:ring-1 focus:ring-primary/30"
                    >
                      {/* Hidden blank — keeps BAG pickable on first use without listing a "—" choice */}
                      <option value="" disabled hidden></option>
                      <option value="bag">BAG</option>
                      <option value="kg">KG</option>
                    </select>
                  </div>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-primary uppercase tracking-wider whitespace-nowrap min-w-[110px]">Quantity</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wider whitespace-nowrap min-w-[100px]">Reorder Qty</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-sky-600 uppercase tracking-wider whitespace-nowrap" title="Total dispatched qty ÷ days since first dispatch (incl. today)">AVG Daily Consumption</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap min-w-[100px]">Lead Time <span className="normal-case font-normal text-slate-400">(Days)</span></th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap min-w-[100px]">Safety Factor</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wider whitespace-nowrap min-w-[100px]" title="Lead Time × Safety Factor × AVG Daily Consumption">Max Level</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-amber-600 uppercase tracking-wider whitespace-nowrap min-w-[120px]">Approval Pending</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-emerald-600 uppercase tracking-wider whitespace-nowrap">Approved Qty</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-violet-600 uppercase tracking-wider whitespace-nowrap" title="Lifts in Purchase → Aawak Details → Pending (on the road)">In Transit Qty</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-amber-600 uppercase tracking-wider whitespace-nowrap" title="Lifts in Purchase → Aawak Details → Transporter Godown">Transporter Godown</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-red-600 uppercase tracking-wider whitespace-nowrap">Order Pending Qty</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[130px]">Godown Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={15} className="p-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
                    <p className="text-sm text-slate-400">Loading live purchase data...</p>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="p-12 text-center">
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
                  const leadTimeVal = getPlanningValue(row, 'lead_time');
                  const safetyFactorVal = getPlanningValue(row, 'safety_factor');
                  const maxLevel = getMaxLevel(leadTimeVal, safetyFactorVal, row.avgDispatch);
                  const actualQty = getReorderActualQty(row);
                  const stockLevel = getStockLevel(row.currentStock, maxLevel);
                  return (
                    <tr key={row.key} className={`group hover:bg-slate-50/80 transition-colors ${selected ? 'bg-primary/5' : ''}`}>
                      <td className={`sticky left-0 z-[5] w-16 min-w-16 px-2 py-3 text-center ${selected ? 'bg-sky-50' : 'bg-white group-hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={selected} onChange={() => toggleSelect(row.key)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                      </td>
                      <td className={`sticky left-16 z-[5] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)] px-4 py-3 text-center font-medium text-slate-800 whitespace-nowrap ${selected ? 'bg-sky-50' : 'bg-white group-hover:bg-slate-50'}`}>
                        {row.productName}{' '}
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">{row.unit}</span>
                      </td>
                      <td className={`px-4 py-3 text-center font-semibold tabular-nums whitespace-nowrap ${STOCK_LEVEL_STYLES[stockLevel].className}`}
                        title={STOCK_LEVEL_STYLES[stockLevel].label}>
                        {formatNum(row.currentStock)}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          disabled={!selected}
                          value={getReorderUnitValue(row)}
                          onChange={(e) => handleReorderUnitChange(row, e.target.value)}
                          className="w-full h-8 text-xs px-2 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                        >
                          <option value="bag">BAG</option>
                          <option value="kg">KG</option>
                        </select>
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
                      <td className="px-4 py-3 text-center font-semibold text-emerald-600 tabular-nums whitespace-nowrap"
                        title={`Pkg/Bag used: ${row.packagingSize} Kg (from Master > Product's Mux)`}>
                        {actualQty != null ? formatNum(actualQty) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-sky-600 tabular-nums whitespace-nowrap"
                        title={row.firstDispatchDate ? `${formatNum(row.dispatchedQty)} dispatched since ${row.firstDispatchDate.split('-').reverse().join('-')}` : 'No dispatches yet'}>
                        {row.avgDispatch != null ? formatNum(row.avgDispatch) : <span className="text-slate-300">0</span>}
                      </td>
                      {[['lead_time', leadTimeVal, 'Days'], ['safety_factor', safetyFactorVal, 'Factor']].map(([field, val, placeholder]) => (
                        <td key={field} className="px-4 py-3 text-center tabular-nums whitespace-nowrap">
                          {selected && canModify ? (
                            <div className="w-20 mx-auto">
                              <Input type="text" placeholder={placeholder}
                                value={val}
                                onChange={(e) => setPlanningValue(row.key, field, e.target.value)}
                                onBlur={() => handlePlanningBlur(row, field)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                className="h-8 text-xs text-center" />
                            </div>
                          ) : (
                            <span className="font-semibold text-slate-700">{val !== '' && val != null ? formatNum(val) : <span className="text-slate-300">—</span>}</span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center font-semibold text-emerald-600 tabular-nums whitespace-nowrap"
                        title={maxLevel != null ? `${formatNum(leadTimeVal)} × ${formatNum(safetyFactorVal)} × ${formatNum(row.avgDispatch)}` : 'Set Lead Time and Safety Factor'}>
                        {maxLevel != null ? formatNum(maxLevel) : <span className="text-slate-300">—</span>}
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
                      <td className="px-4 py-3 text-center font-semibold text-amber-600 tabular-nums whitespace-nowrap">
                        {row.atTptQty > 0 ? formatNum(row.atTptQty) : <span className="text-slate-300">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-red-600 tabular-nums whitespace-nowrap">
                        {row.orderPendingQty > 0 ? formatNum(row.orderPendingQty) : <span className="text-slate-300">0</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col gap-1 w-[120px] mx-auto">
                          {(() => {
                            // Unassigned Godown is a bucket for items with no
                            // real godown pick yet (still awaiting planning/
                            // approval), not an actual stock location — it
                            // never belongs in this per-godown breakdown.
                            const visibleGodowns = row.filteredStats
                              .filter(g => g.godownId !== 'unassigned')
                              .filter(g => g.currentStock !== 0 || g.pendingApprovalQty > 0 || g.approvedQty > 0 || g.inTransitQty > 0 || g.atTptQty > 0 || g.totalOrderedQty > 0)
                              .sort((a, b) => b.currentStock - a.currentStock);
                            return visibleGodowns.length > 0 ? (
                              visibleGodowns.map((g) => (
                                <div key={g.godownId} className="flex items-center justify-between gap-2 text-[11px] leading-tight border-b border-slate-100 last:border-0 pb-1 last:pb-0">
                                  <span
                                    className={`truncate font-medium text-left ${g.godownType !== 'Own' ? 'text-amber-500' : 'text-slate-500'}`}
                                    title={g.godownName}
                                  >
                                    {g.godownName}
                                  </span>
                                  <span className="font-semibold text-slate-700 text-right">{formatNum(g.currentStock)}</span>
                                </div>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">No stock</span>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableScrollSync>

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
