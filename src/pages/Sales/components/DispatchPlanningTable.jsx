import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, Package, Truck, Search,
  AlertCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Sparkles, PackageCheck, PackageX, PackageSearch,
} from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import toast from 'react-hot-toast';
import {
  getAllOrderItemsForDispatch, getAllDispatchPlans, saveDispatchPlan,
  convertQtyToMasterUnit, convertQtyFromMasterUnit,
} from '../../../services/salesService';
import { getAllProductStock } from '../../../services/masterService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { DatePicker } from '@/components/ui/date-picker';
import DataTable from '@/components/DataTable';
import { sanitizeQtyInput } from '@/lib/qty';

const PAGE_SIZE_OPTIONS = [50, 100, 200];
const HISTORY_PAGE_SIZE_OPTIONS = [50, 100, 200];
const DEFAULT_LOW_QTY_THRESHOLD = 5;
const UNIT_OPTIONS = [{ value: 'bag', label: 'BAG' }, { value: 'kg', label: 'KG' }];
const unitLabel = (u) => (u ? String(u).toUpperCase() : '—');

const todayStr = () => new Date().toISOString().split('T')[0];

/* ─── order type badge — same convention as the Orders table ── */
const OrderTypeBadge = ({ processType }) => (
  processType === 'skip_delivered' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase font-medium bg-amber-50 text-amber-700 border border-amber-100">Skip</span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase font-medium bg-blue-50 text-blue-700 border border-blue-100">Process</span>
  )
);

/* ─── dispatch-readiness (stock) badge / dot ─────────────── */
const STOCK_STATUS_META = {
  ready:   { label: 'Ready to Dispatch', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  partial: { label: 'Partial Stock',     dot: 'bg-amber-500',   pill: 'bg-amber-50 text-amber-700 border-amber-100' },
  waiting: { label: 'Stock Shortage',    dot: 'bg-red-500',     pill: 'bg-red-50 text-red-600 border-red-100' },
};
const StockDot = ({ status }) => {
  if (!status) return null;
  const meta = STOCK_STATUS_META[status] || STOCK_STATUS_META.waiting;
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${meta.dot}`} title={meta.label} />;
};

/* ─── priority ordering used for both list sort & smart plan ─── */
/* Low-quantity orders first, then oldest orders first — no payment/rating data available. */
const comparePriority = (a, b, threshold) => {
  const aLow = a.remaining > 0 && a.remaining <= threshold;
  const bLow = b.remaining > 0 && b.remaining <= threshold;
  if (aLow !== bLow) return aLow ? -1 : 1;
  return b.daysPending - a.daysPending;
};

/* ─── summary card ────────────────────────────────────────── */
const SummaryCard = ({ icon: Icon, label, value, color }) => {
  const colors = {
    slate:   { bg: 'bg-slate-50', text: 'text-slate-700', icon: 'text-slate-400', border: 'border-slate-200' },
    blue:    { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-400', border: 'border-blue-100' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-400', border: 'border-emerald-100' },
    red:     { bg: 'bg-red-50', text: 'text-red-600', icon: 'text-red-400', border: 'border-red-100' },
  };
  const c = colors[color] || colors.slate;
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-4 ${c.bg} ${c.border}`}>
      <div className={`w-10 h-10 rounded-lg bg-white flex items-center justify-center border ${c.border}`}>
        <Icon size={18} className={c.icon} />
      </div>
      <div className="min-w-0">
        <div className={`text-xl font-bold tabular-nums leading-tight ${c.text}`}>{value}</div>
        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide leading-tight mt-0.5">{label}</div>
      </div>
    </div>
  );
};

// One product line's position within its own order ("1, 2, 3...n" when an
// order has multiple products) — built from the full raw item list so the
// number stays the same for a given item regardless of sort/filter/page, and
// so History rows (looked up by item_id) agree with Pending rows.
const buildProductNoMap = (rawItems) => {
  const byOrder = new Map();
  rawItems.forEach(it => {
    const orderNo = it.sales_orders?.order_number || '—';
    if (!byOrder.has(orderNo)) byOrder.set(orderNo, []);
    byOrder.get(orderNo).push(it);
  });
  const map = new Map();
  byOrder.forEach(list => {
    [...list]
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
      .forEach((it, idx) => map.set(it.item_id, idx + 1));
  });
  return map;
};

/* ──────────────────────────────────────────────────────────
   Main component
────────────────────────────────────────────────────────── */
const DispatchPlanningTable = ({ godowns, searchTerm, dispatchFilter, onSearchChange, onFilterChange, onSave, user }) => {
  const [items, setItems]                   = useState([]);
  const [historyPlans, setHistoryPlans]     = useState([]);
  const [stockRows, setStockRows]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [currentPage, setCurrentPage]       = useState(1);
  const [pageSize, setPageSize]             = useState(PAGE_SIZE_OPTIONS[0]);
  const [historyPageSize, setHistoryPageSize] = useState(HISTORY_PAGE_SIZE_OPTIONS[0]);

  // inline "check row -> dispatch it" workflow (pending view only)
  const [selectedForDispatch, setSelectedForDispatch] = useState(new Set());
  const [dispatchDraft, setDispatchDraft]   = useState({}); // { [item_id]: { quantity, dispatch_date, godown_id } }
  const [dispatchingAll, setDispatchingAll] = useState(false);

  // smart dispatch planning controls (pending view only)
  const [sortBy]                            = useState('priority');
  const [productFilter, setProductFilter]   = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState('');
  const [lowQtyThreshold] = useState(DEFAULT_LOW_QTY_THRESHOLD);
  const [expandedProducts, setExpandedProducts] = useState(new Set());

  const [historyOrderFilter, setHistoryOrderFilter] = useState('');
  const [historyGodownFilter, setHistoryGodownFilter] = useState('');
  const [historyCustomerFilter, setHistoryCustomerFilter] = useState('');
  const [historyProductFilter, setHistoryProductFilter] = useState('');

  const historyFilterOptions = useMemo(() => {
    const orders = new Set();
    const godowns = new Set();
    const customers = new Set();
    const products = new Set();
    
    (historyPlans || []).forEach(p => {
      if (p.dispatch_status === 'Cancelled' || p.sales_order_items?.sales_orders?.process_type === 'skip_delivered') return;
      
      const orderNo = p.sales_order_items?.sales_orders?.order_number;
      const godown = p.godowns?.name;
      const customer = p.sales_order_items?.sales_orders?.customers?.name;
      const product = p.sales_order_items?.products?.name;
      
      if (orderNo) orders.add(orderNo);
      if (godown) godowns.add(godown);
      if (customer) customers.add(customer);
      if (product) products.add(product);
    });
    
    return {
      orders: [...orders].sort(),
      godowns: [...godowns].sort(),
      customers: [...customers].sort(),
      products: [...products].sort((a, b) => a.localeCompare(b)),
    };
  }, [historyPlans]);

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const [data, stock, plans] = await Promise.all([
        getAllOrderItemsForDispatch(),
        getAllProductStock().catch(() => []),
        getAllDispatchPlans().catch(() => []),
      ]);
      setItems(data);
      setStockRows(stock || []);
      setHistoryPlans(plans || []);
    } catch {
      toast.error('Failed to load dispatch items');
    }
    setLoading(false);
  };

  /* ── stock lookup map (total stock per product, across all godowns) ── */
  const stockByProduct = useMemo(() => {
    const byProduct = {};
    stockRows.forEach(s => {
      const qty = Number(s.current_stock) || 0;
      byProduct[s.product_id] = (byProduct[s.product_id] || 0) + qty;
    });
    return byProduct;
  }, [stockRows]);

  /* ── stock per product per godown: { [product_id]: { [godown_id]: qty } } ── */
  const stockByProductAndGodown = useMemo(() => {
    const map = {};
    stockRows.forEach(s => {
      const qty = Number(s.current_stock) || 0;
      if (!map[s.product_id]) map[s.product_id] = {};
      map[s.product_id][s.godown_id] = (map[s.product_id][s.godown_id] || 0) + qty;
    });
    return map;
  }, [stockRows]);

  /* ── stock breakdown per product per godown (for display) ── */
  const stockByProductByGodown = useMemo(() => {
    const map = {};
    stockRows.forEach(s => {
      const qty = Number(s.current_stock) || 0;
      if (qty <= 0) return;
      const godown = godowns?.find(g => g.godown_id === s.godown_id);
      const godownName = godown?.name || `Godown ${s.godown_id}`;
      if (!map[s.product_id]) map[s.product_id] = [];
      map[s.product_id].push({ godownName, qty });
    });
    return map;
  }, [stockRows, godowns]);

  const productNoMap = useMemo(() => buildProductNoMap(items), [items]);

  // Own godowns first (a dispatch normally leaves from one of these), then
  // Transporter stock-tracking godowns below — each group alphabetical.
  const activeGodownOptions = useMemo(() => {
    const active = (godowns || []).filter(g => g.is_active);
    const isOwn = (g) => (g.godown_type || 'Own') === 'Own';
    const byName = (a, b) => a.name.localeCompare(b.name);
    const own = active.filter(isOwn).sort(byName);
    const transporter = active.filter(g => !isOwn(g)).sort(byName);
    return [...own, ...transporter].map(g => ({ value: g.godown_id, label: g.name }));
  }, [godowns]);

  const toggleProductExpand = (productId) =>
    setExpandedProducts(prev => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return next;
    });

  /* ── computed per-item quantities ─────────────────────── */
  const withQty = useMemo(() =>
    items
      .filter(item => item.sales_orders?.process_type !== 'skip_delivered')
      .map(item => {
        const activePlans     = (item.dispatch_plans || []).filter(p => p.dispatch_status !== 'Cancelled');
        const cancelledQty    = Number(item.cancelled_quantity || 0);
        const effectiveQty    = Number(item.quantity) - cancelledQty;
        // quantity is always the master-unit amount (unchanged meaning from
        // before unit conversion existed) — converted_value is just a record
        // of the raw as-typed figure and may be in a different unit, so it
        // must never be summed here.
        const totalPlanned    = activePlans.reduce((s, p) => s + Number(p.quantity), 0);
        const totalDispatched = activePlans.reduce((s, p) => s + Number(p.already_dispatched || 0), 0);
        const remaining       = effectiveQty - totalPlanned;

        const orderDate    = item.sales_orders?.order_date ? new Date(item.sales_orders.order_date) : null;
        const rawDaysDiff  = orderDate ? differenceInCalendarDays(new Date(), orderDate) : 0;
        const isOverdue    = rawDaysDiff > 0;
        const daysPending  = Math.max(rawDaysDiff, 0);
        const partyName    = item.sales_orders?.customers?.name || '—';
        const productName  = item.products?.name || '—';
        const productStock = stockByProduct[item.product_id] ?? 0;

        // Stock in the specific godown this order is assigned to
        const orderGodownStock = stockByProductAndGodown[item.product_id]?.[item.godown_id] ?? 0;
        const orderGodownName  = item.godowns?.name || godowns?.find(g => g.godown_id === item.godown_id)?.name || '';

        let stockStatus = null;
        if (remaining > 0) {
          if (orderGodownStock <= 0) stockStatus = 'waiting';
          else if (orderGodownStock >= remaining) stockStatus = 'ready';
          else stockStatus = 'partial';
        }

        return {
          ...item, activePlans, cancelledQty, effectiveQty, totalPlanned, totalDispatched, remaining,
          daysPending, isOverdue, partyName, productName, productStock, orderGodownStock, orderGodownName, stockStatus,
          productNo: productNoMap.get(item.item_id) || '—',
        };
      }),
    [items, stockByProduct, stockByProductAndGodown, productNoMap, godowns],
  );

  /* ── filter ───────────────────────────────────────────── */
  const filteredItems = useMemo(() => {
    const term = searchTerm?.toLowerCase() || '';
    return withQty
      .filter(item => {
        if (!term) return true;
        return (
          item.sales_orders?.order_number?.toLowerCase().includes(term) ||
          item.sales_orders?.customers?.name?.toLowerCase().includes(term) ||
          item.products?.name?.toLowerCase().includes(term)
        );
      })
      .filter(item => item.remaining > 0); // Pending stays in this list until fully planned
  }, [withQty, searchTerm]);

  const isPendingView = dispatchFilter === 'pending';

  /* ── History rows: flattened dispatch plans, one row per plan ── */
  const historyRows = useMemo(() => {
    const term = searchTerm?.toLowerCase() || '';
    return (historyPlans || [])
      .filter(p => p.dispatch_status !== 'Cancelled')
      .filter(p => p.sales_order_items?.sales_orders?.process_type !== 'skip_delivered')
      .filter(p => {
        if (historyOrderFilter && p.sales_order_items?.sales_orders?.order_number !== historyOrderFilter) return false;
        if (historyGodownFilter && p.godowns?.name !== historyGodownFilter) return false;
        if (historyCustomerFilter && p.sales_order_items?.sales_orders?.customers?.name !== historyCustomerFilter) return false;
        if (historyProductFilter && p.sales_order_items?.products?.name !== historyProductFilter) return false;

        if (!term) return true;
        return (
          p.sales_order_items?.sales_orders?.order_number?.toLowerCase().includes(term) ||
          p.sales_order_items?.sales_orders?.customers?.name?.toLowerCase().includes(term) ||
          p.sales_order_items?.products?.name?.toLowerCase().includes(term) ||
          p.dispatch_number?.toLowerCase().includes(term)
        );
      })
      .map(p => {
        // quantity is the master-unit dispatch amount (unchanged meaning
        // from before this feature) — unit_price is per master unit, so
        // money math has to be based on it, not on converted_value (which
        // is just a record of the raw as-typed figure, possibly in Kg).
        const dispatchQty = Number(p.quantity || 0);
        const convertedQty = Number(p.converted_value ?? dispatchQty);
        return {
          key: p.plan_id,
          dispatchNo: p.dispatch_number || '—',
          orderDate: p.sales_order_items?.sales_orders?.order_date,
          orderNumber: p.sales_order_items?.sales_orders?.order_number || '—',
          orderedQty: Number(p.sales_order_items?.quantity || 0),
          dispatchQty,
          convertedQty,
          dispatchDate: p.dispatch_date,
          dispatchGodownName: p.godowns?.name || '—',
          customerName: p.sales_order_items?.sales_orders?.customers?.name || '—',
          processType: p.sales_order_items?.sales_orders?.process_type,
          productNo: productNoMap.get(p.order_item_id) || '—',
          productName: p.sales_order_items?.products?.name || '—',
          unit: p.convert_unit || p.sales_order_items?.products?.unit || '—',
          masterUnit: p.sales_order_items?.products?.unit || '—',
          godownName: p.sales_order_items?.godowns?.name || '—',
          unitPrice: Number(p.unit_price || 0),
          totalAmount: Number(p.unit_price || 0) * dispatchQty,
          status: p.dispatch_status,
        };
      })
      .sort((a, b) => new Date(b.dispatchDate || 0) - new Date(a.dispatchDate || 0));
  }, [historyPlans, searchTerm, productNoMap, historyOrderFilter, historyGodownFilter, historyCustomerFilter, historyProductFilter]);

  /* ── product list for the filter dropdown ─────────────── */
  const productOptions = useMemo(() => {
    const map = new Map();
    filteredItems.forEach(item => { if (item.product_id) map.set(item.product_id, item.productName); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [filteredItems]);

  /* ── dashboard items: extra filters + sort (pending view only) ── */
  const dashboardItems = useMemo(() => {
    if (!isPendingView) return filteredItems;
    let list = filteredItems
      .filter(item => !productFilter || String(item.product_id) === productFilter)
      .filter(item => !stockStatusFilter || item.stockStatus === stockStatusFilter);

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'oldest':      return b.daysPending - a.daysPending;
        case 'newest':       return a.daysPending - b.daysPending;
        case 'party':        return a.partyName.localeCompare(b.partyName);
        case 'product':      return a.productName.localeCompare(b.productName);
        case 'pending_qty':  return b.remaining - a.remaining;
        case 'stock':        return b.productStock - a.productStock;
        case 'priority':
        default:             return comparePriority(a, b, lowQtyThreshold);
      }
    });
    return list;
  }, [filteredItems, isPendingView, productFilter, stockStatusFilter, sortBy, lowQtyThreshold]);

  /* ── summary counts (pending view only) ───────────────── */
  const summary = useMemo(() => {
    if (!isPendingView) return null;
    const totalOrders = dashboardItems.length;
    const totalBags = dashboardItems.reduce((s, i) => s + i.remaining, 0);
    const ready = dashboardItems.filter(i => i.stockStatus === 'ready').length;
    const waiting = dashboardItems.filter(i => i.stockStatus === 'partial' || i.stockStatus === 'waiting').length;
    return { totalOrders, totalBags, ready, waiting };
  }, [dashboardItems, isPendingView]);

  /* ── product-wise smart dispatch plan (pending view only) ── */
  const productPlans = useMemo(() => {
    if (!isPendingView) return [];
    const groups = new Map();
    dashboardItems.forEach(item => {
      if (!groups.has(item.product_id)) {
        groups.set(item.product_id, {
          productId: item.product_id,
          productName: item.productName,
          unit: item.products?.unit || '',
          stock: item.productStock,
          orders: [],
        });
      }
      groups.get(item.product_id).orders.push(item);
    });

    return [...groups.values()].map(group => {
      // Stock isn't fungible across godowns — allocate within each order's own godown, not the product's total stock.
      const ordersByGodown = new Map();
      group.orders.forEach(order => {
        const gid = order.godown_id;
        if (!ordersByGodown.has(gid)) ordersByGodown.set(gid, []);
        ordersByGodown.get(gid).push(order);
      });

      let stockLeft = 0;
      const dispatchPlan = [];
      const waitingOrders = [];

      ordersByGodown.forEach((godownOrders, godownId) => {
        let godownStockLeft = stockByProductAndGodown[group.productId]?.[godownId] ?? 0;
        [...godownOrders]
          .sort((a, b) => comparePriority(a, b, lowQtyThreshold))
          .forEach(order => {
            if (godownStockLeft >= order.remaining && order.remaining > 0) {
              const reason = order.remaining <= lowQtyThreshold ? 'Low quantity' : 'Oldest pending order';
              dispatchPlan.push({ ...order, reason });
              godownStockLeft -= order.remaining;
            } else {
              waitingOrders.push(order);
            }
          });
        stockLeft += godownStockLeft;
      });

      const planQtyByItem = new Map(dispatchPlan.map(o => [o.item_id, o.remaining]));
      const tableRows = [...group.orders]
        .sort((a, b) => new Date(a.sales_orders?.order_date || 0) - new Date(b.sales_orders?.order_date || 0))
        .map(o => ({
          item_id: o.item_id,
          orderDateLabel: o.sales_orders?.order_date ? format(new Date(o.sales_orders.order_date), 'dd-MMM-yy') : '—',
          orderNumber: o.sales_orders?.order_number || '—',
          partyName: o.partyName,
          productName: o.productName,
          godownName: o.orderGodownName || '—',
          totalQty: o.effectiveQty,
          dispatched: o.totalDispatched,
          remaining: o.remaining,
          planQty: planQtyByItem.get(o.item_id) || 0,
        }));

      return { ...group, dispatchPlan, waitingOrders, stockLeft, tableRows };
    }).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [dashboardItems, isPendingView, lowQtyThreshold, stockByProductAndGodown]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, dispatchFilter, productFilter, stockStatusFilter, sortBy, pageSize, historyPageSize, historyOrderFilter, historyGodownFilter, historyCustomerFilter, historyProductFilter]);

  const currentDataset = isPendingView ? dashboardItems : historyRows;
  const activePageSize = isPendingView ? pageSize : historyPageSize;
  const totalPages   = Math.max(1, Math.ceil(currentDataset.length / activePageSize));
  // DataTable is memoized and only re-renders when the `data` array's item
  // references change (it deliberately ignores renderRow/renderCard, since
  // those are recreated every render regardless). Our renderRow reads
  // `selectedForDispatch` (checkbox checked state + disabled state of the
  // Qty/Date/Godown inputs) which lives outside `item` — so without baking
  // it into the item objects here, toggling a checkbox wouldn't change any
  // object reference in `data`, the memo would see "nothing changed", and
  // the checkbox/row (and the header's "select all" box) would never
  // visually update.
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return dashboardItems.slice(start, start + pageSize)
      .map(item => ({ 
        ...item, 
        _selected: selectedForDispatch.has(item.item_id),
        _draftVersion: dispatchDraft[item.item_id] || null 
      }));
  }, [dashboardItems, currentPage, pageSize, selectedForDispatch, dispatchDraft]);
  const currentHistoryRows = useMemo(() => {
    const start = (currentPage - 1) * historyPageSize;
    return historyRows.slice(start, start + historyPageSize);
  }, [historyRows, currentPage, historyPageSize]);

  /* ── inline dispatch: select / draft / save ───────────── */
  // Display-only rounding for the live Bag<->Kg conversion preview (2
  // decimals, since a conversion ratio needs finer precision on screen than
  // the 1-decimal rule the actually-stored quantity follows).
  const roundQty = (n) => Math.round((Number(n) || 0) * 100) / 100;

  const getDraft = (item, field) => {
    const d = dispatchDraft[item.item_id];
    if (d && d[field] !== undefined) return d[field];
    const masterUnit = (item.products?.unit || '').toLowerCase();
    if (field === 'unit') return masterUnit;
    if (field === 'quantity') {
      const unit = d?.unit || masterUnit;
      if (unit === masterUnit) return String(item.remaining || '');
      const converted = convertQtyFromMasterUnit(item.remaining, unit, item.products);
      return converted ? String(roundQty(converted)) : '';
    }
    if (field === 'dispatch_date') return ''; // no auto-fill — stays blank until the user picks one
    if (field === 'godown_id') return item.godown_id || '';
    return '';
  };

  const setDraftValue = (itemId, field, value) => {
    setDispatchDraft(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  };

  // Switching the Unit dropdown re-bases the Dispatch Qty default into the
  // newly picked unit (e.g. remaining 15 bags -> 480 when switching to Kg)
  // so a stale number typed in the old unit doesn't linger under a new one.
  const setUnitForItem = (item, newUnit) => {
    const masterUnit = (item.products?.unit || '').toLowerCase();
    const convertedDefault = newUnit === masterUnit
      ? item.remaining
      : roundQty(convertQtyFromMasterUnit(item.remaining, newUnit, item.products));
    setDispatchDraft(prev => ({
      ...prev,
      [item.item_id]: { ...prev[item.item_id], unit: newUnit, quantity: String(convertedDefault || '') },
    }));
  };

  // Live "Converted Qty" preview for a row: the entered Dispatch Qty,
  // converted into the product's master unit via its Mux (kg/bag) factor.
  const getConvertedQtyPreview = (item) => {
    const unit = getDraft(item, 'unit');
    const enteredQty = getDraft(item, 'quantity');
    if (enteredQty === '' || enteredQty === undefined) return null;
    const masterUnit = (item.products?.unit || '').toLowerCase();
    return { value: roundQty(convertQtyToMasterUnit(enteredQty, unit, item.products)), unit: masterUnit };
  };

  // Picking a Dispatch Date for one row fills it into every other row that's
  // currently checkbox-selected too — so setting it once on a multi-row
  // selection applies it to all of them, same as the Vendor Approval page.
  const setDispatchDateForSelected = (item, value) => {
    setDispatchDraft(prev => {
      const next = { ...prev };
      const targets = new Set(selectedForDispatch);
      targets.add(item.item_id);
      targets.forEach(id => { next[id] = { ...next[id], dispatch_date: value }; });
      return next;
    });
  };

  const ensureDraft = (item) => {
    setDispatchDraft(prev => {
      if (prev[item.item_id]) return prev;
      const masterUnit = (item.products?.unit || '').toLowerCase();
      return {
        ...prev,
        [item.item_id]: { quantity: String(item.remaining || ''), unit: masterUnit, dispatch_date: '', godown_id: item.godown_id || '' },
      };
    });
  };

  const toggleDispatchSelect = (item) => {
    setSelectedForDispatch(prev => {
      const next = new Set(prev);
      if (next.has(item.item_id)) next.delete(item.item_id);
      else next.add(item.item_id);
      return next;
    });
    ensureDraft(item);
  };

  const toggleSelectAllPending = () => {
    const ids = currentItems.map(i => i.item_id);
    const allSelected = ids.length > 0 && ids.every(id => selectedForDispatch.has(id));
    if (allSelected) {
      setSelectedForDispatch(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
    } else {
      setSelectedForDispatch(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n; });
      currentItems.forEach(ensureDraft);
    }
  };

  const buildDispatchPayload = (item) => {
    const draft = dispatchDraft[item.item_id] || {};
    const masterUnit = (item.products?.unit || '').toLowerCase();
    const unit = draft.unit || masterUnit;
    const quantity = Number(draft.quantity ?? item.remaining);
    // convertedQty is the master-unit equivalent — what stock deduction and
    // pending-qty checks below actually compare against, since a dispatch
    // recorded in Kg still has to come out of a bag-tracked godown balance.
    const convertedQty = Math.round(convertQtyToMasterUnit(quantity, unit, item.products));
    return {
      quantity, unit, convertedQty,
      godownId: draft.godown_id || item.godown_id,
      dispatchDate: draft.dispatch_date || todayStr(),
      unitPrice: Number(item.unit_price) || 0,
    };
  };

  const validateDispatchPayload = (item, payload) => {
    if (!payload.quantity || payload.quantity <= 0) return 'Enter a valid dispatch quantity.';
    if (payload.convertedQty > item.remaining) return `Quantity (${payload.convertedQty}) exceeds pending (${item.remaining}).`;
    if (!payload.godownId) return 'Select a dispatch godown.';

    // Check available stock (in the product's master unit)
    const availableStock = stockByProductAndGodown[item.product_id]?.[payload.godownId] || 0;
    if (payload.convertedQty > availableStock) {
      return `Not enough stock in selected godown. Available: ${availableStock}, Requested: ${payload.convertedQty}`;
    }

    if (!payload.dispatchDate) return 'Select a dispatch date.';
    if (!payload.unitPrice) return 'This item has no unit price on record.';
    return null;
  };

  const handleBulkDispatch = async () => {
    const toProcess = currentItems.filter(i => selectedForDispatch.has(i.item_id));
    if (toProcess.length === 0) { toast.error('No rows selected.'); return; }

    setDispatchingAll(true);
    let success = 0;
    for (const item of toProcess) {
      const payload = buildDispatchPayload(item);
      const error = validateDispatchPayload(item, payload);
      if (error) { toast.error(`${item.sales_orders?.order_number || item.item_id}: ${error}`); continue; }
      try {
        await saveDispatchPlan({
          order_item_id: item.item_id,
          // quantity must be the master-unit amount — it drives stock/ledger
          // math exactly like every other dispatch_plans row. The raw
          // as-typed figure (in whichever unit was picked) is only ever a
          // record, stored separately as converted_qty (-> converted_value).
          quantity: payload.convertedQty,
          unit: payload.unit,
          converted_qty: payload.quantity,
          godown_id: payload.godownId,
          unit_price: payload.unitPrice,
          dispatch_date: payload.dispatchDate,
          created_by: user?.user_id,
        });
        success++;
      } catch (err) {
        toast.error(`Failed for ${item.sales_orders?.order_number || item.item_id}: ${err.message}`);
      }
    }
    setDispatchingAll(false);
    setSelectedForDispatch(new Set());
    if (success > 0) {
      toast.success(`${success} dispatch plan${success !== 1 ? 's' : ''} created.`);
      await loadItems();
      onSave?.();
    }
  };

  const isEmpty = isPendingView ? dashboardItems.length === 0 : historyRows.length === 0;
  const selectedCount = selectedForDispatch.size;

  return (
    <div className="flex flex-col flex-1">
      {/* ── Pending/History toggle, search, and (pending view only) filter controls — all in one row ── */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 shrink-0">
          {[
            { id: 'pending', label: 'Pending' },
            { id: 'history', label: 'History' },
          ].map(f => (
            <button key={f.id} type="button" onClick={() => onFilterChange?.(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                dispatchFilter === f.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" size={16} />
          <Input type="text" placeholder="Search items..." className="pl-9 h-9"
            value={searchTerm} onChange={(e) => onSearchChange?.(e.target.value)} />
        </div>

        {isPendingView && (
          <>
            <select
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[150px] shrink-0"
            >
              <option value="">All Products</option>
              {productOptions.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
            </select>

            <select
              value={stockStatusFilter}
              onChange={e => setStockStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[150px] shrink-0"
            >
              <option value="">All Stock Status</option>
              <option value="ready">Ready to Dispatch</option>
              <option value="partial">Partial Stock</option>
              <option value="waiting">Stock Shortage</option>
            </select>

            <Button size="sm" onClick={handleBulkDispatch} disabled={dispatchingAll || selectedCount === 0} className="gap-1.5 text-xs h-9 w-full sm:w-auto sm:ml-auto shrink-0">
              {dispatchingAll ? (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-b-2 border-white" />
              ) : (
                <Truck size={14} />
              )}
              Dispatch Selected
            </Button>
          </>
        )}

        {!isPendingView && (
          <>
            <select
              value={historyOrderFilter}
              onChange={e => setHistoryOrderFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[120px] shrink-0"
            >
              <option value="">All Orders</option>
              {historyFilterOptions.orders.map(o => <option key={o} value={o}>{o}</option>)}
            </select>

            <select
              value={historyGodownFilter}
              onChange={e => setHistoryGodownFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[120px] shrink-0"
            >
              <option value="">All Godowns</option>
              {historyFilterOptions.godowns.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            
            <select
              value={historyCustomerFilter}
              onChange={e => setHistoryCustomerFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[120px] shrink-0"
            >
              <option value="">All Customers</option>
              {historyFilterOptions.customers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              value={historyProductFilter}
              onChange={e => setHistoryProductFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto sm:min-w-[120px] shrink-0"
            >
              <option value="">All Products</option>
              {historyFilterOptions.products.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading dispatch items...</p>
        </div>
      ) : (
      <div className={`bg-white rounded-xl border border-slate-200 flex flex-col ${!isPendingView ? 'flex-1 min-h-0' : 'h-[420px] sm:h-[480px] md:h-[560px]'}`}>

        {/* ── legend (shown for both Pending and History) ── */}
        <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-400 flex-wrap shrink-0">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-200 inline-block" />Ordered</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-300 inline-block" />Planned</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-300 inline-block" />Dispatched</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300 inline-block" />Remaining/Pending</span>
          <span className="text-slate-200">|</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Stock available</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Partial stock</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Stock shortage</span>

          {!isPendingView && (
            <div className="ml-auto flex items-center gap-4">
              <span className="font-medium text-slate-500">
                {currentDataset.length} item{currentDataset.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* ══════════════════════ PENDING TABLE (via shared DataTable) ══════════════════════ */}
        {isPendingView && (
          <DataTable
            emptyState={
              <div className="p-12 text-center w-full">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <ClipboardList size={32} className="text-slate-300" />
                </div>
                <h3 className="text-base font-semibold text-slate-600 mb-1">No Dispatch Items</h3>
                <p className="text-sm text-slate-400">
                  {searchTerm
                    ? 'No items match your search.'
                    : 'All orders are fully planned.'}
                </p>
              </div>
            }
            minWidth="1950px"
            headers={[
              {
                label: (
                  <input type="checkbox"
                    checked={currentItems.length > 0 && currentItems.every(i => selectedForDispatch.has(i.item_id))}
                    onChange={toggleSelectAllPending}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                ), className: 'w-10 !py-3 !px-4',
              },
              { label: 'Order Date', className: '!text-xs !font-semibold !text-slate-500 !py-3 !px-4' },
              { label: 'Order No', className: '!text-xs !font-semibold !text-slate-500 !py-3 !px-4' },
              { label: 'Ordered Qty', className: '!text-xs !font-semibold !text-slate-500 !py-3 !px-4' },
              { label: <span className="text-amber-600">Pending Qty</span>, className: '!text-xs !font-semibold !py-3 !px-4' },
              { label: 'Product No', className: '!text-xs !font-semibold !text-slate-500 !py-3 !px-4' },
              { label: 'Product Name', className: 'min-w-[160px] !text-xs !font-semibold !text-slate-500 !py-3 !px-4' },
              { label: <span className="text-primary">Unit</span>, className: 'min-w-[110px] !text-xs !font-semibold !py-3 !px-4' },
              { label: <span className="text-primary">Converted Qty</span>, className: 'min-w-[110px] !text-xs !font-semibold !py-3 !px-4' },
              { label: 'Dispatch Qty', className: 'min-w-[100px] !text-xs !font-semibold !text-slate-500 !py-3 !px-4' },
              { label: <span className="text-primary">Dispatch Date</span>, className: 'min-w-[150px] !text-xs !font-semibold !py-3 !px-4' },
              { label: <span className="text-primary">Dispatch Godown</span>, className: 'min-w-[150px] !text-xs !font-semibold !py-3 !px-4' },
              { label: 'Customer Name', className: '!text-xs !font-semibold !text-slate-500 !py-3 !px-4' },
              { label: 'Order Type', className: '!text-xs !font-semibold !text-slate-500 !py-3 !px-4' },
              { label: 'Godown Name', className: '!text-xs !font-semibold !text-slate-500 !py-3 !px-4' },
              { label: 'Unit Price', className: '!text-xs !font-semibold !text-slate-500 !py-3 !px-4' },
              { label: 'Total Amount', className: '!text-xs !font-semibold !text-slate-500 !py-3 !px-4' },
            ]}
            data={currentItems}
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={pageSize}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setPageSize}
            totalResults={dashboardItems.length}
            itemsPerPageOptions={PAGE_SIZE_OPTIONS}
            renderRow={(item) => {
              const selected = selectedForDispatch.has(item.item_id);
              const converted = getConvertedQtyPreview(item);
              return (
                <tr key={item.item_id} className={`text-xs hover:bg-slate-50/80 transition-colors ${selected ? 'bg-primary/5' : ''}`}>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={selected} onChange={() => toggleDispatchSelect(item)}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600 whitespace-nowrap">
                    {item.sales_orders?.order_date ? format(new Date(item.sales_orders.order_date), 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-primary whitespace-nowrap">{item.sales_orders?.order_number || '—'}</td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-900 tabular-nums whitespace-nowrap">{item.effectiveQty}</td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-600 tabular-nums">
                      <StockDot status={item.stockStatus} />
                      {item.remaining}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500 whitespace-nowrap">{item.productNo}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-semibold text-slate-800">{item.productName}</span>
                  </td>
                  <td className="px-4 py-3 min-w-[110px]">
                    <Dropdown value={getDraft(item, 'unit')}
                      onValueChange={v => setUnitForItem(item, v)}
                      options={UNIT_OPTIONS} placeholder="Unit..."
                      align="start" disabled={!selected}
                      className="h-8 text-xs text-center" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="w-20 mx-auto">
                      <Input type="text" inputMode="decimal" placeholder="Qty"
                        disabled={!selected}
                        value={getDraft(item, 'quantity')}
                        onChange={e => setDraftValue(item.item_id, 'quantity', sanitizeQtyInput(e.target.value))}
                        className="h-8 text-xs text-center" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600 tabular-nums whitespace-nowrap">
                    {converted ? `${converted.value} ${unitLabel(converted.unit)}` : '—'}
                  </td>
                  <td className="px-4 py-3 min-w-[150px]">
                    <DatePicker
                      value={getDraft(item, 'dispatch_date')}
                      disabled={!selected}
                      onChange={e => setDispatchDateForSelected(item, e.target.value)}
                      placeholder="Select date..."
                      className="h-8 text-xs text-center" />
                  </td>
                  <td className="px-4 py-3 min-w-[150px]">
                    <Dropdown value={getDraft(item, 'godown_id')}
                      onValueChange={v => setDraftValue(item.item_id, 'godown_id', v)}
                      options={activeGodownOptions} placeholder="Godown..."
                      searchPlaceholder="Search godowns..." align="start"
                      disabled={!selected}
                      className="h-8 text-xs text-center" />
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600 whitespace-nowrap">{item.sales_orders?.customers?.name || '—'}</td>
                  <td className="px-4 py-3 text-center whitespace-nowrap"><OrderTypeBadge processType={item.sales_orders?.process_type} /></td>
                  <td className="px-4 py-3 text-center text-slate-600 whitespace-nowrap">{item.orderGodownName || '—'}</td>
                  <td className="px-4 py-3 text-center text-slate-600 tabular-nums whitespace-nowrap">
                    {item.unit_price ? `₹${Number(item.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                    {item.unit_price ? `₹${(Number(item.unit_price) * Number(item.effectiveQty || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                </tr>
              );
            }}
            renderCard={(item) => {
              const selected = selectedForDispatch.has(item.item_id);
              const converted = getConvertedQtyPreview(item);
              return (
                <div key={item.item_id} className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 ${selected ? 'ring-2 ring-primary/20' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={selected} onChange={() => toggleDispatchSelect(item)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer mt-0.5" />
                      <div>
                        <div className="font-semibold text-slate-800 text-sm">{item.sales_orders?.order_number || '—'}</div>
                        <div className="text-xs text-slate-500">
                          {item.productName} <span className="uppercase text-[10px] text-slate-400">({item.products?.unit})</span>
                        </div>
                      </div>
                    </div>
                    <OrderTypeBadge processType={item.sales_orders?.process_type} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    <div><span className="text-slate-400">Order Date:</span> <span className="text-slate-700">{item.sales_orders?.order_date ? format(new Date(item.sales_orders.order_date), 'dd/MM/yyyy') : '—'}</span></div>
                    <div><span className="text-slate-400">Customer:</span> <span className="text-slate-700">{item.sales_orders?.customers?.name || '—'}</span></div>
                    <div><span className="text-slate-400">Ordered:</span> <span className="font-semibold text-slate-900">{item.effectiveQty}</span></div>
                    <div>
                      <span className="text-slate-400">Pending:</span>{' '}
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                        <StockDot status={item.stockStatus} />{item.remaining}
                      </span>
                    </div>
                    <div><span className="text-slate-400">Product #:</span> <span className="text-slate-700">{item.productNo}</span></div>
                    <div><span className="text-slate-400">Godown:</span> <span className="text-slate-700">{item.orderGodownName || '—'}</span></div>
                    <div><span className="text-slate-400">Unit Price:</span> <span className="text-slate-700">{item.unit_price ? `₹${Number(item.unit_price).toLocaleString('en-IN')}` : '—'}</span></div>
                    <div><span className="text-slate-400">Total:</span> <span className="font-medium text-slate-800">{item.unit_price ? `₹${(Number(item.unit_price) * Number(item.effectiveQty || 0)).toLocaleString('en-IN')}` : '—'}</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Unit</label>
                      <Dropdown value={getDraft(item, 'unit')} onValueChange={v => setUnitForItem(item, v)}
                        options={UNIT_OPTIONS} placeholder="Unit..." align="start" disabled={!selected} />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Converted Qty</label>
                      <Input type="text" inputMode="decimal" placeholder="Qty"
                        disabled={!selected} value={getDraft(item, 'quantity')}
                        onChange={e => setDraftValue(item.item_id, 'quantity', sanitizeQtyInput(e.target.value))}
                        className="h-8 text-xs text-center" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Dispatch Qty</label>
                      <div className="h-9 flex items-center justify-center text-xs text-slate-600 bg-slate-50 rounded-lg border border-slate-200">
                        {converted ? `${converted.value} ${unitLabel(converted.unit)}` : '—'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Dispatch Date</label>
                      <DatePicker value={getDraft(item, 'dispatch_date')} disabled={!selected}
                        onChange={e => setDispatchDateForSelected(item, e.target.value)} placeholder="Select date..." />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Dispatch Godown</label>
                      <Dropdown value={getDraft(item, 'godown_id')} onValueChange={v => setDraftValue(item.item_id, 'godown_id', v)}
                        options={activeGodownOptions} placeholder="Godown..." searchPlaceholder="Search godowns..." align="start" disabled={!selected} />
                    </div>
                  </div>
                </div>
              );
            }}
          />
        )}

        {/* ══════════════════════ HISTORY TABLE ══════════════════════ */}
        {!isPendingView && (
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 min-h-0">
            <table className="w-full text-xs relative">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="bg-blue-50 border-b border-slate-200">
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Dispatch No</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Order Date</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Order No</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">Ordered Qty</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Unit</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-violet-600 uppercase tracking-wider whitespace-nowrap">Dispatch Qty</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Converted Qty</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Dispatch Date</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Dispatch Godown</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Customer Name</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Order Type</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Product No</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[160px]">Product Name</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Godown Name</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Unit Price</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentHistoryRows.length === 0 && (
                  <tr>
                    <td colSpan="16" className="p-12 text-center">
                      <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                        <ClipboardList size={32} className="text-slate-300" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-600 mb-1">No Dispatch Items</h3>
                      <p className="text-sm text-slate-400">
                        {searchTerm ? 'No items match your search.' : 'No planned dispatches yet.'}
                      </p>
                    </td>
                  </tr>
                )}
                {currentHistoryRows.map(row => (
                  <tr key={row.key} className={`hover:bg-slate-50/80 transition-colors ${row.status === 'Dispatch Done' ? 'bg-emerald-50/30' : ''}`}>
                    <td className="px-4 py-3 text-center font-semibold text-slate-700 whitespace-nowrap">{row.dispatchNo}</td>
                    <td className="px-4 py-3 text-center text-slate-600 whitespace-nowrap">{row.orderDate ? format(new Date(row.orderDate), 'dd/MM/yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-primary whitespace-nowrap">{row.orderNumber}</td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-900 tabular-nums whitespace-nowrap">{row.orderedQty}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase font-medium">{row.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-violet-600 tabular-nums whitespace-nowrap">{row.dispatchQty}</td>
                    <td className="px-4 py-3 text-center text-slate-600 tabular-nums whitespace-nowrap">{row.convertedQty} {unitLabel(row.unit)}</td>
                    <td className="px-4 py-3 text-center text-slate-600 whitespace-nowrap">{row.dispatchDate ? format(new Date(row.dispatchDate), 'dd/MM/yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-center text-slate-600 whitespace-nowrap">{row.dispatchGodownName}</td>
                    <td className="px-4 py-3 text-center text-slate-600 whitespace-nowrap">{row.customerName}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap"><OrderTypeBadge processType={row.processType} /></td>
                    <td className="px-4 py-3 text-center text-slate-500 whitespace-nowrap">{row.productNo}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-semibold text-slate-800">{row.productName}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600 whitespace-nowrap">{row.godownName}</td>
                    <td className="px-4 py-3 text-center text-slate-600 tabular-nums whitespace-nowrap">
                      {row.unitPrice ? `₹${row.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                      {row.totalAmount ? `₹${row.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── pagination footer (History only — Pending's is built into DataTable above) ── */}
        {!isPendingView && (
          <div className="px-4 py-2.5 border-t border-royal-600/25 bg-blue-50 flex items-center justify-between gap-4 rounded-b-xl shrink-0">
            {/* Left Side: Row Dropdown */}
            <div className="flex items-center gap-2">
              <select
                value={historyPageSize}
                onChange={(e) => setHistoryPageSize(Number(e.target.value))}
                className="ring-1 ring-royal-600/25 rounded-xl px-2 py-1 focus:outline-none focus:ring-2 focus:ring-royal-500/30 bg-white font-medium text-xs md:text-sm"
              >
                {HISTORY_PAGE_SIZE_OPTIONS.map((val) => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
              <span className="text-[10px] md:text-sm text-slate-500 whitespace-nowrap font-medium hidden sm:inline">
                {currentDataset.length > 0 ? (currentPage - 1) * historyPageSize + 1 : 0}-{Math.min(currentPage * historyPageSize, currentDataset.length)} of {currentDataset.length}
              </span>
            </div>

            {/* Right Side: Pagination Controls */}
            <div className="flex items-center gap-2 md:gap-4 text-gray-700">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 md:px-2 md:py-1 ring-1 ring-royal-600/25 rounded-xl bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-royal-50 transition flex items-center justify-center text-royal-600"
              >
                <ChevronLeft size={16} strokeWidth={2.5} />
              </button>
              <div className="flex items-center text-xs md:text-sm font-semibold text-gray-600">
                {currentPage} / {totalPages || 1}
              </div>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="p-1.5 md:px-2 md:py-1 ring-1 ring-royal-600/25 rounded-xl bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-royal-50 transition flex items-center justify-center text-royal-600"
              >
                <ChevronRight size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── Smart Dispatch Planning (pending view only) ── */}
      {isPendingView && productPlans.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mt-4 flex flex-col h-[420px] sm:h-[480px] md:h-[560px]">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 bg-slate-50 shrink-0">
            <div className="bg-primary/10 p-1.5 rounded-lg">
              <Sparkles size={16} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Smart Dispatch Planning</h3>
              <p className="text-[11px] text-slate-400">
                Auto-recommended allocation based on low quantity, order age & available stock.
              </p>
            </div>
          </div>

          {/* ── Dashboard summary cards ── */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 border-b border-slate-100 shrink-0">
              <SummaryCard icon={ClipboardList} label="Total Pending Orders" value={summary.totalOrders} color="slate" />
              <SummaryCard icon={Package} label="Total Pending Bags" value={summary.totalBags} color="blue" />
              <SummaryCard icon={PackageCheck} label="Ready to Dispatch" value={summary.ready} color="emerald" />
              <SummaryCard icon={PackageX} label="Waiting for Stock" value={summary.waiting} color="red" />
            </div>
          )}

          <div className="divide-y divide-slate-100 overflow-y-auto scrollbar-hide flex-1 min-h-0">
            {productPlans.map(group => {
              const isOpen = expandedProducts.has(group.productId);
              return (
                <div key={group.productId}>
                  <button
                    type="button"
                    onClick={() => toggleProductExpand(group.productId)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <Package size={16} className="text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-slate-800 text-sm">{group.productName}</span>
                      <span className="text-xs text-slate-400 ml-2">
                        {group.orders.length} pending order{group.orders.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {/* Godown-wise stock pills */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {(stockByProductByGodown[group.productId] || []).length > 0 ? (
                        (stockByProductByGodown[group.productId] || []).map(({ godownName, qty }) => (
                          <span
                            key={godownName}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 bg-white text-[11px] font-medium text-slate-600 whitespace-nowrap"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                            {godownName}:
                            <span className="font-bold text-slate-800">{qty}</span>
                            <span className="text-slate-400">{group.unit}</span>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">No stock</span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-primary/20 bg-primary/5 text-[11px] font-bold text-primary whitespace-nowrap">
                        Total: {group.stock} {group.unit}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-emerald-600 shrink-0">
                      {group.dispatchPlan.length} can dispatch
                    </span>
                    {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 bg-slate-50/60">
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full text-xs bg-white">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Party's Name</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name of Item</th>
                              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Godown</th>
                              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Qty</th>
                              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Dispatched</th>
                              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Remaining</th>
                              <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.tableRows.map(row => (
                              <tr key={row.item_id} className="hover:bg-slate-50">
                                <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{row.orderDateLabel}</td>
                                <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{row.orderNumber}</td>
                                <td className="px-3 py-1.5 font-medium text-slate-800">{row.partyName}</td>
                                <td className="px-3 py-1.5 text-slate-600">{row.productName}</td>
                                <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{row.godownName}</td>
                                <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">{row.totalQty}</td>
                                <td className="px-3 py-1.5 text-right text-violet-600 tabular-nums">{row.dispatched}</td>
                                <td className="px-3 py-1.5 text-right text-amber-600 font-medium tabular-nums">{row.remaining}</td>
                                <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${row.planQty > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>
                                  {row.planQty > 0 ? row.planQty : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {group.stockLeft > 0 && group.waitingOrders.length > 0 && (
                        <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                          <PackageSearch size={12} className="text-slate-400 shrink-0" />
                          Remaining stock after this plan: <strong className="text-slate-600">{group.stockLeft} {group.unit}</strong> — not enough for the remaining order(s), they wait for production/stock.
                        </p>
                      )}
                      {group.dispatchPlan.length === 0 && (
                        <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                          <AlertCircle size={12} className="text-slate-400 shrink-0" />
                          No stock available — all orders wait for production.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DispatchPlanningTable;
