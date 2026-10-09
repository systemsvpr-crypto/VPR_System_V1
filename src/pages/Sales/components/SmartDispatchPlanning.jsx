import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Warehouse, Users, Package, Truck, CheckCircle2, Search, Download, RefreshCw,
  RotateCcw, ChevronDown, ChevronRight, PencilLine, Hand, PauseCircle, Boxes,
  ClipboardList, Sparkles, AlertCircle, Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { getAllOrderItemsForDispatch } from '../../../services/salesService';
import { getAllProductStock } from '../../../services/masterService';
import { getInTransitAawakDeliveries, getPendingDeliveryItemsForPlanning } from '../../../services/purchaseService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { sanitizeQtyInput, roundQty, formatQty } from '@/lib/qty';

const OVERRIDES_KEY = 'smart_dispatch_overrides';
const PARTY_TYPES_KEY = 'smart_dispatch_party_types';

const DISPATCH_TYPES = [
  { value: 'planned', label: 'Planned Dispatch' },
  { value: 'self_pickup', label: 'Self Pickup' },
  { value: 'hold', label: 'Hold' },
];

const STATUS_META = {
  full:    { label: 'Fully Dispatched', pill: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  partial: { label: 'Partial',          pill: 'bg-amber-50 text-amber-700 border-amber-100' },
  none:    { label: 'Not Dispatched',   pill: 'bg-red-50 text-red-600 border-red-100' },
};

const AVATAR_COLORS = ['bg-sky-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-500', 'bg-rose-500', 'bg-teal-600', 'bg-indigo-600', 'bg-pink-600'];

// localStorage can be unavailable (private mode, blocked site data) — the
// plan must still work, it just won't remember edits across reloads.
const readStore = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; }
};
const writeStore = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
};

const initials = (name) =>
  String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avatarColor = (name) => {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const fmtDate = (d) => (d ? format(new Date(d), 'dd MMM yy') : '—');

const StatusPill = ({ status }) => {
  const meta = STATUS_META[status] || STATUS_META.none;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap ${meta.pill}`}>
      {meta.label}
    </span>
  );
};

const statusOf = (suggested, pending) => {
  if (pending > 0 && suggested >= pending) return 'full';
  if (suggested > 0) return 'partial';
  return 'none';
};

// Oldest order first, then the smaller batch first.
const comparePriority = (a, b) => {
  const da = new Date(a.orderDate || 0) - new Date(b.orderDate || 0);
  if (da !== 0) return da;
  return a.remaining - b.remaining;
};

/* ──────────────────────────────────────────────────────────
   Allocation engine — pure, so the same logic backs the
   on-screen plan and the "Export All Locations" file.
────────────────────────────────────────────────────────── */
const computePlan = ({ lines, locationId, locationName, stockMap, inTransitMap = new Map(), overrides, partyTypes }) => {
  const locLines = lines.filter(l => l.godownId === locationId);
  const planned = [];
  const excluded = [];
  locLines.forEach(l => ((partyTypes[l.partyName] || 'planned') === 'planned' ? planned : excluded).push(l));

  const byProduct = new Map();
  planned.forEach(l => {
    if (!byProduct.has(l.productId)) byProduct.set(l.productId, []);
    byProduct.get(l.productId).push(l);
  });

  const allocated = [];
  const items = [];

  byProduct.forEach((productLines, productId) => {
    const available = Math.max(0, stockMap[productId]?.[locationId] ?? 0);
    const inTransit = inTransitMap.get(`${productId}_${locationId}`) || inTransitMap.get(String(productId)) || null;
    const recvQty = inTransit?.totalQty || 0;
    const recvDate = inTransit?.earliestDate || null;
    const inTransitLifts = inTransit?.deliveries || [];

    const sorted = [...productLines].sort(comparePriority);
    const rankOf = new Map(sorted.map((l, i) => [l.itemId, i + 1]));
    const result = new Map();
    let left = available;

    // 1. Manual edits are honoured first — recalculation never overwrites
    //    them — but still can't exceed what's physically in the godown.
    sorted.filter(l => overrides[l.itemId] !== undefined).forEach(l => {
      const wanted = Math.min(roundQty(overrides[l.itemId]), l.remaining);
      const qty = roundQty(Math.max(0, Math.min(wanted, left)));
      left = roundQty(left - qty);
      const capped = qty < wanted;
      result.set(l.itemId, {
        suggested: qty, manual: true, capped,
        reason: capped
          ? `Manually edited to ${formatQty(wanted)} — capped at ${formatQty(qty)} (only that much stock left)`
          : 'Manually edited by user',
      });
    });

    // 2. Oldest first, smaller batch first: fully cover every order that fits.
    const skipped = [];
    sorted.filter(l => !result.has(l.itemId)).forEach(l => {
      if (left >= l.remaining) {
        left = roundQty(left - l.remaining);
        const rank = rankOf.get(l.itemId);
        result.set(l.itemId, {
          suggested: l.remaining, manual: false,
          reason: rank === 1
            ? `Oldest order (${fmtDate(l.orderDate)}) — given first priority`
            : `Priority #${rank} (ordered ${fmtDate(l.orderDate)}) — stock available`,
        });
      } else {
        skipped.push(l);
      }
    });

    // 3. Whatever stock is left is split partially among the bigger orders.
    skipped.forEach(l => {
      const qty = roundQty(Math.min(left, l.remaining));
      left = roundQty(left - qty);
      let reason;
      if (qty > 0) reason = `Partial — only ${formatQty(qty)} ${l.unit} left after higher-priority orders; ${formatQty(l.remaining - qty)} short`;
      else if (available <= 0) reason = `No stock of this item at ${locationName}`;
      else reason = 'Stock used up by older / smaller orders';
      result.set(l.itemId, { suggested: qty, manual: false, reason });
    });

    const productAllocated = sorted.map(l => {
      const r = result.get(l.itemId);
      const balance = roundQty(l.remaining - r.suggested);
      return {
        ...l,
        ...r,
        balance,
        status: statusOf(r.suggested, l.remaining),
        recvQty,
        recvDate,
        inTransitLifts,
      };
    });
    allocated.push(...productAllocated);

    const suggested = roundQty(productAllocated.reduce((s, l) => s + l.suggested, 0));
    items.push({
      productId,
      productName: sorted[0].productName,
      unit: sorted[0].unit,
      available,
      inTransitQty: recvQty,
      inTransitDate: recvDate,
      inTransitLifts,
      suggested,
      balanceStock: roundQty(available - suggested),
      parties: [...new Set(sorted.map(l => l.partyName))],
      remainingOrders: productAllocated.filter(l => l.balance > 0).length,
      remainingQty: roundQty(productAllocated.reduce((s, l) => s + l.balance, 0)),
      lines: productAllocated,
    });
  });

  const partyMap = new Map();
  allocated.forEach(l => {
    if (!partyMap.has(l.partyName)) partyMap.set(l.partyName, []);
    partyMap.get(l.partyName).push(l);
  });
  const parties = [...partyMap.entries()].map(([partyName, pl]) => {
    const pending = roundQty(pl.reduce((s, l) => s + l.remaining, 0));
    const suggested = roundQty(pl.reduce((s, l) => s + l.suggested, 0));
    const status = pl.every(l => l.status === 'full') ? 'full' : suggested > 0 ? 'partial' : 'none';
    return {
      partyName,
      lines: [...pl].sort(comparePriority),
      itemCount: new Set(pl.map(l => l.productId)).size,
      orderCount: new Set(pl.map(l => l.orderNumber)).size,
      pending, suggested, balance: roundQty(pending - suggested), status,
      hasManual: pl.some(l => l.manual),
      oldest: pl.reduce((m, l) => (!m || new Date(l.orderDate) < new Date(m) ? l.orderDate : m), null),
    };
  }).sort((a, b) => new Date(a.oldest || 0) - new Date(b.oldest || 0));

  const totalPending = roundQty(allocated.reduce((s, l) => s + l.remaining, 0));
  const totalSuggested = roundQty(allocated.reduce((s, l) => s + l.suggested, 0));
  const orderKeys = new Map();
  allocated.forEach(l => {
    const prev = orderKeys.get(l.orderNumber);
    orderKeys.set(l.orderNumber, prev === undefined ? l.status === 'full' : prev && l.status === 'full');
  });
  const fullyDispatchedOrders = [...orderKeys.values()].filter(Boolean).length;

  return {
    allocated, parties,
    items: items.sort((a, b) => a.productName.localeCompare(b.productName)),
    excluded,
    totals: {
      parties: parties.length,
      pending: totalPending,
      suggested: totalSuggested,
      remaining: roundQty(totalPending - totalSuggested),
      pct: totalPending > 0 ? Math.round((totalSuggested / totalPending) * 100) : 0,
      orders: orderKeys.size,
      fullyDispatchedOrders,
      partialOrders: orderKeys.size - fullyDispatchedOrders,
      manualEdits: allocated.filter(l => l.manual).length,
    },
  };
};

/* ─── CSV export ─────────────────────────────────────────── */
const csvCell = (c) => `"${String(c ?? '').replace(/"/g, '""')}"`;
const downloadCsv = (rows, filename) => {
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const planToCsvRows = (plan, locationName) => {
  const rows = [
    [`Location: ${locationName}`],
    ['Party', 'Item', 'Order No.', 'Unit', 'Pending Qty', 'Recv Qty (In Transit)', 'Recv Date', 'Dispatch Qty', 'Balance Qty', 'Manually Edited'],
  ];
  plan.parties.forEach(p => {
    const dispatchLines = p.lines.filter(l => l.suggested > 0 || l.remaining > 0);
    if (dispatchLines.length === 0) return;
    dispatchLines.forEach(l => rows.push([
      p.partyName, l.productName, l.orderNumber, l.unit, l.remaining,
      l.recvQty > 0 ? l.recvQty : '', l.recvDate ? fmtDate(l.recvDate) : '',
      l.suggested, l.balance, l.manual ? 'Yes' : '',
    ]));
    rows.push(['', `Total — ${p.partyName}`, '', '', '', '', '', roundQty(p.lines.filter(l => l.suggested > 0).reduce((s, l) => s + l.suggested, 0)), '', '']);
  });
  rows.push([]);
  rows.push(['Item-wise Summary']);
  rows.push(['Item', 'Unit', 'Available Stock', 'In-Transit Recv Qty', 'In-Transit Recv Date', 'Dispatch Qty', 'Balance Stock', 'Remaining Orders']);
  plan.items.forEach(i => rows.push([
    i.productName, i.unit, i.available,
    i.inTransitQty > 0 ? i.inTransitQty : '', i.inTransitDate ? fmtDate(i.inTransitDate) : '',
    i.suggested, i.balanceStock, i.remainingOrders,
  ]));
  rows.push([]);
  rows.push(['Grand Total Dispatch', '', '', '', '', plan.totals.suggested]);
  rows.push([]);
  return rows;
};

/* ─── small UI pieces ────────────────────────────────────── */
// Column templates — rows stack as cards below md and line up as a table above it.
const PARTY_COLS = 'md:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.1fr)_140px_20px]';
const ITEM_COLS = 'md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_minmax(0,1.1fr)_20px]';
const LINE_COLS = 'md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.85fr)_minmax(0,0.95fr)_minmax(0,0.85fr)_minmax(0,0.8fr)_minmax(0,1.1fr)]';

const StatCard = ({ icon: Icon, label, value, sub, tone }) => {
  const tones = {
    blue:    'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    indigo:  'bg-indigo-50 text-indigo-600',
    amber:   'bg-amber-50 text-amber-600',
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-slate-500 leading-tight">{label}</div>
        <div className="text-lg sm:text-xl font-bold text-slate-800 tabular-nums leading-tight">{value}</div>
        {sub && <div className="text-[10px] text-slate-400 leading-tight">{sub}</div>}
      </div>
    </div>
  );
};

const PartyAvatar = ({ name }) => (
  <span className={`w-8 h-8 rounded-full ${avatarColor(name)} text-white text-[11px] font-semibold flex items-center justify-center shrink-0`}>
    {initials(name)}
  </span>
);

const DispatchTypeSelect = ({ value, onChange, className = '' }) => (
  <select
    value={value}
    onClick={e => e.stopPropagation()}
    onChange={e => onChange(e.target.value)}
    className={`h-8 px-2 text-xs rounded-md border border-slate-200 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/30 ${className}`}
  >
    {DISPATCH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
  </select>
);

// A number cell: shows its own label on mobile (where there's no header row).
const Metric = ({ label, value, className = 'text-slate-700' }) => (
  <div className="min-w-0 md:text-right">
    <div className="text-[10px] text-slate-400 uppercase tracking-wide md:hidden">{label}</div>
    <div className={`text-sm font-semibold tabular-nums ${className}`}>{value}</div>
  </div>
);

const HeaderRow = ({ cols, labels }) => (
  <div className={`hidden md:grid ${cols} gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200`}>
    {labels.map((l, i) => (
      <div key={i} className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wide ${l.right ? 'text-right' : ''}`}>{l.text}</div>
    ))}
  </div>
);

/* ──────────────────────────────────────────────────────────
   Main component
────────────────────────────────────────────────────────── */
const SmartDispatchPlanning = ({ godowns }) => {
  const [rawItems, setRawItems] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  const [inTransitDeliveries, setInTransitDeliveries] = useState([]);
  const [pendingDeliveryItems, setPendingDeliveryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [activeLocation, setActiveLocation] = useState(null);
  const [viewMode, setViewMode] = useState('party'); // 'party' | 'item'
  const [search, setSearch] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState(new Set());

  const [overrides, setOverrides] = useState(() => readStore(OVERRIDES_KEY));
  const [partyTypes, setPartyTypes] = useState(() => readStore(PARTY_TYPES_KEY));
  const [editDrafts, setEditDrafts] = useState({}); // raw text while typing

  useEffect(() => { writeStore(OVERRIDES_KEY, overrides); }, [overrides]);
  useEffect(() => { writeStore(PARTY_TYPES_KEY, partyTypes); }, [partyTypes]);

  const loadData = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [data, stock, inTransit, pendingDelivery] = await Promise.all([
        getAllOrderItemsForDispatch(),
        getAllProductStock().catch(() => []),
        getInTransitAawakDeliveries().catch(() => []),
        getPendingDeliveryItemsForPlanning().catch(() => []),
      ]);
      setRawItems(data || []);
      setStockRows(stock || []);
      setInTransitDeliveries(inTransit || []);
      setPendingDeliveryItems(pendingDelivery || []);
      setLastUpdated(new Date());
    } catch {
      toast.error('Failed to load dispatch data');
    }
    silent ? setRefreshing(false) : setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Stock changes elsewhere (production, purchase receipts) — re-pull when
  // the user comes back to this tab so the suggestions stay current.
  useEffect(() => {
    const onFocus = () => loadData(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadData]);

  const locations = useMemo(() =>
    (godowns || [])
      .filter(g => g.is_active !== false && (g.godown_type || 'Own') === 'Own')
      .sort((a, b) => a.name.localeCompare(b.name)),
    [godowns],
  );

  const stockMap = useMemo(() => {
    const map = {};
    stockRows.forEach(s => {
      if (!map[s.product_id]) map[s.product_id] = {};
      map[s.product_id][s.godown_id] = (map[s.product_id][s.godown_id] || 0) + (Number(s.current_stock) || 0);
    });
    return map;
  }, [stockRows]);

  const inTransitMap = useMemo(() => {
    const map = new Map();

    const addEntry = (prodId, godownId, qty, date, meta) => {
      if (!prodId || qty <= 0) return;
      if (godownId) {
        const locKey = `${prodId}_${godownId}`;
        if (!map.has(locKey)) {
          map.set(locKey, { totalQty: 0, earliestDate: null, dates: [], deliveries: [] });
        }
        const entry = map.get(locKey);
        entry.totalQty = roundQty(entry.totalQty + qty);
        if (date) {
          entry.dates.push(date);
          if (!entry.earliestDate || new Date(date) < new Date(entry.earliestDate)) {
            entry.earliestDate = date;
          }
        }
        entry.deliveries.push(meta);
      }

      const prodKey = String(prodId);
      if (!map.has(prodKey)) {
        map.set(prodKey, { totalQty: 0, earliestDate: null, dates: [], deliveries: [] });
      }
      const prodEntry = map.get(prodKey);
      prodEntry.totalQty = roundQty(prodEntry.totalQty + qty);
      if (date) {
        prodEntry.dates.push(date);
        if (!prodEntry.earliestDate || new Date(date) < new Date(prodEntry.earliestDate)) {
          prodEntry.earliestDate = date;
        }
      }
      prodEntry.deliveries.push(meta);
    };

    // 1. Aawak Details (In Transit)
    (inTransitDeliveries || []).forEach(del => {
      const prodId = del.purchase_indent_items?.product_id;
      if (!prodId) return;
      const godownId = del.purchase_delivery_godowns?.[0]?.godown_id || del.purchase_indent_items?.approved_godown_id || '';

      let qty = 0;
      if (del.received_quantity != null && Number(del.received_quantity) > 0) {
        qty = Number(del.received_quantity);
      } else {
        const unit = (del.purchase_indent_items?.products?.unit || '').toLowerCase();
        const fallback = unit === 'kg' ? del.dispatch_qty_kg : del.dispatch_qty_bag;
        qty = Number(fallback || del.dispatch_qty_bag || del.dispatch_qty_kg || 0);
      }

      const date = del.receiving_date || del.expected_delivery_date || del.delivery_date || null;
      addEntry(prodId, godownId, qty, date, { ...del, _source: 'aawak_in_transit' });
    });

    // 2. Delivery Section (Pending)
    (pendingDeliveryItems || []).forEach(item => {
      const prodId = item.product_id;
      if (!prodId) return;
      const godownId = item.approved_godown_id || '';
      const qty = Number(item.remaining_alloc_qty ?? item.remaining_qty ?? 0);
      const date = item.expected_dispatch_date || item.planning_date || null;
      addEntry(prodId, godownId, qty, date, { ...item, _source: 'delivery_pending' });
    });

    return map;
  }, [inTransitDeliveries, pendingDeliveryItems]);

  /* ── pending order lines (same remaining-qty rule as Dispatch Planning) ── */
  const pendingLines = useMemo(() =>
    rawItems
      .filter(item => item.sales_orders?.process_type !== 'skip_delivered')
      .map(item => {
        const activePlans = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
        const effectiveQty = Number(item.quantity) - Number(item.cancelled_quantity || 0);
        const planned = activePlans.reduce((s, p) => s + Number(p.quantity), 0);
        return {
          itemId: item.item_id,
          godownId: item.godown_id,
          productId: item.product_id,
          productName: item.products?.name || '—',
          unit: (item.products?.unit || '').toUpperCase(),
          partyName: item.sales_orders?.customers?.name || '—',
          orderNumber: item.sales_orders?.order_number || '—',
          orderDate: item.sales_orders?.order_date,
          remaining: roundQty(effectiveQty - planned),
        };
      })
      .filter(l => l.remaining > 0),
    [rawItems],
  );

  const locationOrderCounts = useMemo(() => {
    const counts = {};
    pendingLines.forEach(l => {
      if (!counts[l.godownId]) counts[l.godownId] = new Set();
      counts[l.godownId].add(l.orderNumber);
    });
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.size]));
  }, [pendingLines]);

  useEffect(() => {
    if (locations.length > 0 && !locations.some(l => l.godown_id === activeLocation)) {
      setActiveLocation(locations[0].godown_id);
    }
  }, [locations, activeLocation]);

  useEffect(() => { setExpanded(new Set()); setItemFilter(''); }, [activeLocation, viewMode]);

  const activeLocationName = locations.find(l => l.godown_id === activeLocation)?.name || '';

  const plan = useMemo(() => computePlan({
    lines: pendingLines, locationId: activeLocation, locationName: activeLocationName,
    stockMap, inTransitMap, overrides, partyTypes,
  }), [pendingLines, activeLocation, activeLocationName, stockMap, inTransitMap, overrides, partyTypes]);

  /* ── filters ── */
  const term = search.trim().toLowerCase();
  const lineMatches = (l) =>
    (!itemFilter || String(l.productId) === itemFilter) && (!statusFilter || l.status === statusFilter);

  const visibleParties = useMemo(() => plan.parties
    .filter(p => !term || p.partyName.toLowerCase().includes(term))
    .filter(p => (!itemFilter && !statusFilter) || p.lines.some(lineMatches)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [plan, term, itemFilter, statusFilter]);

  const visibleItems = useMemo(() => plan.items
    .filter(i => !itemFilter || String(i.productId) === itemFilter)
    .filter(i => !term || i.productName.toLowerCase().includes(term) || i.parties.some(p => p.toLowerCase().includes(term)))
    .filter(i => !statusFilter || i.lines.some(l => l.status === statusFilter)),
  [plan, term, itemFilter, statusFilter]);

  const excludedByType = useMemo(() => {
    const groups = { self_pickup: new Map(), hold: new Map() };
    plan.excluded.forEach(l => {
      const type = partyTypes[l.partyName];
      const g = groups[type];
      if (!g) return;
      if (!g.has(l.partyName)) g.set(l.partyName, []);
      g.get(l.partyName).push(l);
    });
    return groups;
  }, [plan, partyTypes]);

  /* ── edit handlers ── */
  const toggleExpand = (key) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const commitEdit = (line) => {
    const raw = editDrafts[line.itemId];
    if (raw === undefined) return;
    setEditDrafts(prev => { const { [line.itemId]: _, ...rest } = prev; return rest; });
    if (raw === '') return;
    const qty = roundQty(raw);
    if (qty > line.remaining) toast.error(`Can't dispatch more than pending (${formatQty(line.remaining)} ${line.unit})`);
    setOverrides(prev => ({ ...prev, [line.itemId]: Math.min(qty, line.remaining) }));
  };

  const resetLine = (itemId) => setOverrides(prev => { const { [itemId]: _, ...rest } = prev; return rest; });

  const resetLocation = () => {
    const ids = new Set(pendingLines.filter(l => l.godownId === activeLocation).map(l => l.itemId));
    const count = Object.keys(overrides).filter(id => ids.has(Number(id)) || ids.has(id)).length;
    if (count === 0) { toast('No manual edits to reset.'); return; }
    if (!window.confirm(`Discard ${count} manual edit${count !== 1 ? 's' : ''} at ${activeLocationName} and restore the suggested plan?`)) return;
    setOverrides(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.has(Number(id)) && !ids.has(id))));
    toast.success('Reset to suggested plan.');
  };

  const setPartyType = (partyName, type) => {
    setPartyTypes(prev => {
      if (type === 'planned') { const { [partyName]: _, ...rest } = prev; return rest; }
      return { ...prev, [partyName]: type };
    });
    const label = DISPATCH_TYPES.find(t => t.value === type)?.label;
    toast.success(`${partyName} → ${label}`);
  };

  /* ── export ── */
  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportLocation = () => {
    if (plan.totals.suggested <= 0) { toast.error('Nothing to dispatch at this location.'); return; }
    const safe = activeLocationName.replace(/[^\w-]+/g, '_');
    downloadCsv(planToCsvRows(plan, activeLocationName), `dispatch_plan_${safe}_${stamp()}.csv`);
  };
  const exportAll = () => {
    const rows = [];
    let grand = 0;
    locations.forEach(loc => {
      const p = computePlan({ lines: pendingLines, locationId: loc.godown_id, locationName: loc.name, stockMap, inTransitMap, overrides, partyTypes });
      if (p.totals.suggested <= 0) return;
      grand += p.totals.suggested;
      rows.push(...planToCsvRows(p, loc.name));
    });
    if (rows.length === 0) { toast.error('Nothing to dispatch at any location.'); return; }
    rows.push(['All Locations — Grand Total Dispatch', '', '', '', '', roundQty(grand)]);
    downloadCsv(rows, `dispatch_plan_all_locations_${stamp()}.csv`);
  };


  /* ── order lines inside an expanded party / item (shared by both views) ── */
  const renderLines = (lines, { showParty }) => (
    <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
      <div className={`hidden md:grid ${LINE_COLS} gap-3 px-3 py-2 bg-slate-50 rounded-t-lg`}>
        {[
          { text: showParty ? 'Party' : 'Item' },
          { text: 'Order' },
          { text: 'Pending', right: true },
          { text: 'Recv Qty', right: true },
          { text: 'Recv Date', center: true },
          { text: 'Dispatch', right: true },
          { text: 'Balance', right: true },
          { text: 'Status' },
        ].map((h, i) => (
          <div key={i} className={`text-[10px] font-semibold text-slate-500 uppercase tracking-wide ${h.right ? 'text-right' : h.center ? 'text-center' : ''}`}>{h.text}</div>
        ))}
      </div>
      {lines.length === 0 && <div className="px-3 py-4 text-xs text-slate-400 text-center">No lines match the filters.</div>}
      {lines.map(l => {
        const draft = editDrafts[l.itemId];
        return (
          <div key={l.itemId} className={`px-3 py-2.5 ${l.manual ? 'bg-violet-50/50' : ''}`}>
            <div className={`grid grid-cols-2 gap-x-3 gap-y-2 ${LINE_COLS} md:items-center`}>
              <div className="min-w-0 col-span-2 md:col-span-1">
                <div className="text-xs font-semibold text-slate-800 break-words">{showParty ? l.partyName : l.productName}</div>
                {l.manual && (
                  <span className="inline-flex items-center gap-1 mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-600">
                    <PencilLine size={9} /> Manually Edited
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500">
                <span className="md:hidden text-slate-400">Order: </span>{l.orderNumber}
                <span className="block text-[10px] text-slate-400">{fmtDate(l.orderDate)}</span>
              </div>
              <div className="md:hidden flex items-start justify-end"><StatusPill status={l.status} /></div>
              <div className="col-span-2 grid grid-cols-2 sm:grid-cols-5 gap-2 md:contents">
                <Metric label="Pending" value={`${formatQty(l.remaining)} ${l.unit}`} />
                <div className="min-w-0 md:text-right">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide md:hidden">Recv Qty</div>
                  {l.recvQty > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 whitespace-nowrap">
                      {formatQty(l.recvQty)} {l.unit}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">—</span>
                  )}
                </div>
                <div className="min-w-0 md:text-center">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide md:hidden">Recv Date</div>
                  {l.recvDate ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 whitespace-nowrap"
                      title={l.inTransitLifts?.length > 1 ? `${l.inTransitLifts.length} in-transit lifts arriving` : undefined}
                    >
                      <Calendar size={11} className="text-slate-400" />
                      {fmtDate(l.recvDate)}
                      {l.inTransitLifts?.length > 1 && (
                        <span className="text-[10px] text-blue-600 font-bold">+{l.inTransitLifts.length - 1}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">—</span>
                  )}
                </div>
                <div className="min-w-0 md:text-right">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide md:hidden">Dispatch</div>
                  <div className="flex items-center gap-1 md:justify-end">
                    <input
                      inputMode="decimal"
                      value={draft !== undefined ? draft : String(l.suggested)}
                      onChange={e => setEditDrafts(prev => ({ ...prev, [l.itemId]: sanitizeQtyInput(e.target.value) }))}
                      onBlur={() => commitEdit(l)}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      className={`w-full max-w-[80px] h-8 px-2 text-right tabular-nums rounded-md border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                        l.manual ? 'border-violet-300 text-violet-700 bg-white' : 'border-slate-200 text-blue-700'
                      }`}
                    />
                    {l.manual && (
                      <button type="button" onClick={() => resetLine(l.itemId)} title="Reset to suggested"
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0">
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <Metric label="Balance" value={formatQty(l.balance)} className={l.balance > 0 ? 'text-amber-600' : 'text-slate-500'} />
              </div>
              <div className="hidden md:block"><StatusPill status={l.status} /></div>
            </div>
            <p className={`mt-1.5 text-[11px] leading-snug ${l.capped ? 'text-red-600' : 'text-slate-500'}`}>
              <span className="font-medium text-slate-400">Reason: </span>{l.reason}
            </p>
          </div>
        );
      })}
    </div>
  );

  const ViewPlanChevron = ({ open }) => (
    <span className="text-slate-400 shrink-0">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
  );

  /* ── render ── */
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 flex flex-col items-center justify-center gap-3 text-slate-400">
        <RefreshCw size={22} className="animate-spin" />
        <span className="text-sm">Building dispatch plan…</span>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Warehouse size={32} className="text-slate-300 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-600">No active godowns</h3>
        <p className="text-xs text-slate-400 mt-1">Add an Own godown in Master to start dispatch planning.</p>
      </div>
    );
  }

  const { totals } = plan;
  const selfPickupCount = excludedByType.self_pickup.size;
  const holdCount = excludedByType.hold.size;
  const list = viewMode === 'party' ? visibleParties : visibleItems;

  return (
    <div className="flex flex-col gap-4">
      {/* ── location + view toggles ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-2 sm:p-3 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 flex-1">
          {locations.map(loc => {
            const isActive = loc.godown_id === activeLocation;
            return (
              <button key={loc.godown_id} type="button" onClick={() => setActiveLocation(loc.godown_id)}
                className={`flex items-center gap-2.5 px-3 sm:px-4 py-2 rounded-lg border text-left transition-colors ${
                  isActive ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                <Warehouse size={18} className={`shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <div className="min-w-0">
                  <div className={`text-sm font-semibold leading-tight truncate ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>{loc.name}</div>
                  <div className="text-[10px] text-slate-400 leading-tight">{locationOrderCounts[loc.godown_id] || 0} orders</div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 bg-slate-100 rounded-lg p-1 shrink-0">
          {[{ id: 'party', label: 'Party-wise', icon: Users }, { id: 'item', label: 'Item-wise', icon: Boxes }].map(v => (
            <button key={v.id} type="button" onClick={() => setViewMode(v.id)}
              className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
                viewMode === v.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <v.icon size={14} />{v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── summary ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Total Parties" value={totals.parties} sub="in this location" tone="blue" />
        <StatCard icon={Package} label="Total Pending Qty" value={formatQty(totals.pending)} sub="across all parties" tone="emerald" />
        <StatCard icon={Truck} label="Suggested Dispatch" value={formatQty(totals.suggested)} sub={`${totals.pct}% of pending`} tone="indigo" />
        <StatCard icon={CheckCircle2} label="Remaining After Dispatch" value={formatQty(totals.remaining)} sub={`${totals.pending > 0 ? 100 - totals.pct : 0}% still pending`} tone="amber" />
      </div>

      {/* ── toolbar ── */}
      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="grid grid-cols-2 md:flex gap-2 flex-1">
          <div className="relative col-span-2 md:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={15} />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={viewMode === 'party' ? 'Search party...' : 'Search item or party...'} className="pl-8 h-9 text-xs w-full" />
          </div>
          <select value={itemFilter} onChange={e => setItemFilter(e.target.value)}
            className="h-9 px-2.5 text-xs rounded-md border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0">
            <option value="">All Items</option>
            {plan.items.map(i => <option key={i.productId} value={String(i.productId)}>{i.productName}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="h-9 px-2.5 text-xs rounded-md border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0">
            <option value="">All Status</option>
            <option value="full">Fully Dispatched</option>
            <option value="partial">Partial</option>
            <option value="none">Not Dispatched</option>
          </select>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadData(true)} disabled={refreshing}
            className="h-9 gap-1.5 px-3 text-xs font-medium text-slate-600 border-slate-200">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /><span>Recalculate</span>
          </Button>
          <Button variant="outline" size="sm" onClick={resetLocation} disabled={totals.manualEdits === 0}
            className="h-9 gap-1.5 px-3 text-xs font-medium text-slate-600 border-slate-200">
            <RotateCcw size={14} /><span>Reset{totals.manualEdits > 0 ? ` (${totals.manualEdits})` : ''}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportAll}
            className="h-9 gap-1.5 px-3 text-xs font-medium text-slate-600 border-slate-200">
            <Download size={14} /><span>Export All</span>
          </Button>
          <Button size="sm" onClick={exportLocation} className="h-9 gap-1.5 px-3.5 text-xs font-medium shadow-2xs">
            <Download size={14} /><span className="truncate">Export {activeLocationName}</span>
          </Button>
        </div>
      </div>
      {lastUpdated && (
        <p className="-mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
          <Calendar size={11} /> Updated {format(lastUpdated, 'dd MMM yyyy, hh:mm a')} · Oldest orders first, then smaller batches; leftover stock is split partially. Never exceeds godown stock.
        </p>
      )}

      {/* ── party-wise / item-wise list ── */}
      <div className="bg-white rounded-xl border border-slate-200">
        {list.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList size={30} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No pending orders to plan at {activeLocationName}</p>
            <p className="text-xs text-slate-400 mt-1">Try another location or clear the filters.</p>
          </div>
        ) : viewMode === 'party' ? (
          <>
            <HeaderRow cols={PARTY_COLS} labels={[
              { text: 'Party' }, { text: 'Pending', right: true }, { text: 'Dispatch', right: true }, { text: 'Balance', right: true },
              { text: 'Status' }, { text: 'Dispatch Type' }, { text: '' },
            ]} />
            <div className="divide-y divide-slate-100">
              {visibleParties.map(p => {
                const key = `p:${p.partyName}`;
                const isOpen = expanded.has(key);
                return (
                  <div key={key} className={isOpen ? 'bg-slate-50/70' : ''}>
                    <div onClick={() => toggleExpand(key)}
                      className={`cursor-pointer px-4 py-3 hover:bg-slate-50 flex flex-col gap-3 md:grid ${PARTY_COLS} md:gap-3 md:items-center`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PartyAvatar name={p.partyName} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-800 break-words flex items-center gap-1.5">
                            {p.partyName}
                            {p.hasManual && <PencilLine size={11} className="text-violet-500 shrink-0" />}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {p.itemCount} item{p.itemCount !== 1 ? 's' : ''} • {p.orderCount} order{p.orderCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <span className="md:hidden flex items-center gap-2"><StatusPill status={p.status} /><ViewPlanChevron open={isOpen} /></span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 md:contents">
                        <Metric label="Pending" value={formatQty(p.pending)} />
                        <Metric label="Dispatch" value={formatQty(p.suggested)} className="text-blue-700" />
                        <Metric label="Balance" value={formatQty(p.balance)} className={p.balance > 0 ? 'text-amber-600' : 'text-slate-500'} />
                      </div>
                      <div className="hidden md:block"><StatusPill status={p.status} /></div>
                      <DispatchTypeSelect value="planned" onChange={t => setPartyType(p.partyName, t)} className="w-full" />
                      <span className="hidden md:block"><ViewPlanChevron open={isOpen} /></span>
                    </div>
                    {isOpen && <div className="px-3 sm:px-4 pb-4">{renderLines(p.lines.filter(lineMatches), { showParty: false })}</div>}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <HeaderRow cols={ITEM_COLS} labels={[
              { text: 'Item' }, { text: 'Available', right: true }, { text: 'Dispatch', right: true }, { text: 'Balance Stock', right: true },
              { text: 'Remaining Orders', right: true }, { text: 'Parties' }, { text: '' },
            ]} />
            <div className="divide-y divide-slate-100">
              {visibleItems.map(i => {
                const key = `i:${i.productId}`;
                const isOpen = expanded.has(key);
                const lines = i.lines.filter(l => (!statusFilter || l.status === statusFilter) &&
                  (!term || i.productName.toLowerCase().includes(term) || l.partyName.toLowerCase().includes(term)));
                return (
                  <div key={key} className={isOpen ? 'bg-slate-50/70' : ''}>
                    <div onClick={() => toggleExpand(key)}
                      className={`cursor-pointer px-4 py-3 hover:bg-slate-50 flex flex-col gap-3 md:grid ${ITEM_COLS} md:gap-3 md:items-center`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Package size={16} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-800 break-words flex items-center gap-1.5 flex-wrap">
                            <span>{i.productName}</span>
                            {i.inTransitQty > 0 && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0"
                                title={`Incoming shipments: ${formatQty(i.inTransitQty)} ${i.unit}${i.inTransitDate ? ` arriving/expected ${fmtDate(i.inTransitDate)}` : ''}`}
                              >
                                <Truck size={10} /> +{formatQty(i.inTransitQty)} {i.unit} incoming{i.inTransitDate ? ` (${fmtDate(i.inTransitDate)})` : ''}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">{i.unit || '—'}</div>
                        </div>
                        <span className="md:hidden"><ViewPlanChevron open={isOpen} /></span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:contents">
                        <Metric label="Available" value={formatQty(i.available)} />
                        <Metric label="Dispatch" value={formatQty(i.suggested)} className="text-blue-700" />
                        <Metric label="Balance Stock" value={formatQty(i.balanceStock)} />
                        <Metric label="Remaining Orders"
                          value={i.remainingQty > 0 ? `${i.remainingOrders} (${formatQty(i.remainingQty)} short)` : i.remainingOrders}
                          className={i.remainingOrders > 0 ? 'text-amber-600' : 'text-emerald-600'} />
                      </div>
                      <div className="text-xs text-slate-500 min-w-0">
                        <span className="md:hidden text-[10px] text-slate-400 uppercase tracking-wide block">Parties</span>
                        <span className="font-medium text-slate-700">{i.parties.length}</span> — {i.parties.join(', ')}
                      </div>
                      <span className="hidden md:block"><ViewPlanChevron open={isOpen} /></span>
                    </div>
                    {isOpen && <div className="px-3 sm:px-4 pb-4">{renderLines(lines, { showParty: true })}</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── self pickup / hold ── */}
      {(selfPickupCount > 0 || holdCount > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            { type: 'self_pickup', title: 'Self Pickup Pending', icon: Hand, tone: 'text-sky-600 bg-sky-50' },
            { type: 'hold', title: 'On Hold', icon: PauseCircle, tone: 'text-slate-600 bg-slate-100' },
          ].filter(s => excludedByType[s.type].size > 0).map(section => (
            <div key={section.type} className="bg-white rounded-xl border border-slate-200">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <span className={`p-1.5 rounded-lg ${section.tone}`}><section.icon size={15} /></span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">{section.title}</h3>
                  <p className="text-[11px] text-slate-400">Not included in the automatic plan at {activeLocationName}</p>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {[...excludedByType[section.type].entries()].map(([partyName, lines]) => (
                  <div key={partyName} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2.5">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <PartyAvatar name={partyName} />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800 break-words">{partyName}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 space-y-0.5">
                          {lines.map(l => (
                            <div key={l.itemId}>{l.productName} — <span className="font-medium text-slate-700">{formatQty(l.remaining)} {l.unit}</span> <span className="text-slate-400">({l.orderNumber})</span></div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DispatchTypeSelect value={section.type} onChange={t => setPartyType(partyName, t)} className="w-full sm:w-40" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── what remains after dispatch ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Boxes size={16} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-800">Stock Remaining After Dispatch</h3>
          </div>
          {plan.items.length === 0 ? (
            <p className="text-xs text-slate-400">No items planned.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {plan.items.map(i => (
                <div key={i.productId} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="text-[11px] text-slate-500 leading-tight break-words">{i.productName}</div>
                  <div className="text-sm font-bold text-slate-800 tabular-nums mt-1">
                    {formatQty(i.balanceStock)} <span className="text-[10px] font-normal text-slate-400">{i.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList size={16} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-800">Pending Orders After Dispatch</h3>
          </div>
          <dl className="text-xs divide-y divide-slate-100">
            {[
              ['Total Orders', totals.orders],
              ['Fully Dispatched', totals.fullyDispatchedOrders],
              ['Partial / Pending', totals.partialOrders],
              ['Manual Edits', totals.manualEdits],
              ['Self Pickup Parties', selfPickupCount],
              ['On Hold Parties', holdCount],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-2">
                <dt className="text-slate-500">{k}</dt><dd className="font-semibold text-slate-800 tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
};

export default SmartDispatchPlanning;
