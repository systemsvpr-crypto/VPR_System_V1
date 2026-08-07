import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, Plus, Package, CheckCircle2,
  AlertCircle, ChevronDown, ChevronUp, Download, Clock,
  ArrowUpDown, Sparkles, PackageCheck, PackageX, PackageSearch,
} from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { getAllOrderItemsForDispatch } from '../../../services/salesService';
import { getAllProductStock } from '../../../services/masterService';
import Pagination from '@/components/ui/pagination';
import PlanDispatchModal from './PlanDispatchModal';

const ITEMS_PER_PAGE = 10;
const DEFAULT_LOW_QTY_THRESHOLD = 5;

/* ─── tiny status badge ──────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const map = {
    Pending:                'bg-slate-100 text-slate-500 border-slate-200',
    Planned:                'bg-blue-50 text-blue-700 border-blue-100',
    'Dispatch Done':        'bg-emerald-50 text-emerald-700 border-emerald-100',
    'Partially Dispatched': 'bg-amber-50 text-amber-700 border-amber-100',
    Cancelled:              'bg-red-50 text-red-400 border-red-100',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${map[status] || map.Pending}`}>
      {status}
    </span>
  );
};

/* ─── quantity pill ──────────────────────────────────────── */
const QtyPill = ({ value, color, label }) => {
  const colors = {
    blue:    'bg-blue-50 text-blue-700 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    violet:  'bg-violet-50 text-violet-700 border-violet-100',
    amber:   'bg-amber-50 text-amber-700 border-amber-100',
    slate:   'bg-slate-100 text-slate-500 border-slate-200',
  };
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg border px-2.5 py-1.5 min-w-[56px] ${colors[color] || colors.slate}`}>
      <span className="text-base font-bold tabular-nums leading-tight">{value}</span>
      <span className="text-[9px] font-medium uppercase tracking-wide opacity-70 leading-tight mt-0.5">{label}</span>
    </div>
  );
};

/* ─── progress bar ───────────────────────────────────────── */
const ProgressBar = ({ ordered, planned, dispatched }) => {
  if (!ordered) return null;
  const plannedPct    = Math.min((planned / ordered) * 100, 100);
  const dispatchedPct = Math.min((dispatched / ordered) * 100, 100);
  return (
    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mt-2">
      <div
        className="h-full bg-violet-400 float-left rounded-l-full"
        style={{ width: `${dispatchedPct}%` }}
      />
      <div
        className="h-full bg-emerald-300 float-left"
        style={{ width: `${Math.max(plannedPct - dispatchedPct, 0)}%` }}
      />
    </div>
  );
};

/* ─── dispatch-readiness (stock) badge ───────────────────── */
const STOCK_STATUS_META = {
  ready:   { label: 'Ready to Dispatch', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  partial: { label: 'Partial Stock',     dot: 'bg-amber-500',   pill: 'bg-amber-50 text-amber-700 border-amber-100' },
  waiting: { label: 'Stock Shortage',    dot: 'bg-red-500',     pill: 'bg-red-50 text-red-600 border-red-100' },
};
const StockStatusBadge = ({ status }) => {
  const meta = STOCK_STATUS_META[status] || STOCK_STATUS_META.waiting;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
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

const SORT_OPTIONS = [
  { id: 'priority',    label: 'Highest Priority' },
  { id: 'oldest',      label: 'Oldest Order' },
  { id: 'newest',      label: 'Newest Order' },
  { id: 'party',       label: 'Party Name' },
  { id: 'product',     label: 'Product' },
  { id: 'pending_qty', label: 'Pending Quantity' },
  { id: 'stock',       label: 'Available Stock' },
];

/* ──────────────────────────────────────────────────────────
   Main component
────────────────────────────────────────────────────────── */
const DispatchPlanningTable = ({ godowns, searchTerm, dispatchFilter, onSave, user }) => {
  const [items, setItems]                   = useState([]);
  const [stockRows, setStockRows]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [currentPage, setCurrentPage]       = useState(1);
  const [expandedItems, setExpandedItems]   = useState(new Set());
  const [modalItem, setModalItem]           = useState(null);

  // smart dispatch planning controls (pending view only)
  const [sortBy, setSortBy]                 = useState('priority');
  const [productFilter, setProductFilter]   = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState('');
  const [lowQtyThreshold, setLowQtyThreshold] = useState(DEFAULT_LOW_QTY_THRESHOLD);
  const [expandedProducts, setExpandedProducts] = useState(new Set());

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const [data, stock] = await Promise.all([
        getAllOrderItemsForDispatch(),
        getAllProductStock().catch(() => []),
      ]);
      setItems(data);
      setStockRows(stock || []);
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

  /* ── toggle expand ────────────────────────────────────── */
  const toggleExpand = (itemId) =>
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });

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
        };
      }),
    [items, stockByProduct, stockByProductAndGodown],
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
      .filter(item => {
        if (dispatchFilter === 'pending')  return item.remaining > 0;          // stay in Pending until fully planned
        if (dispatchFilter === 'history')  return item.activePlans.length > 0; // show all items that have any plan
        return true;
      });
  }, [withQty, searchTerm, dispatchFilter]);

  const isPendingView = dispatchFilter === 'pending';

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

  useEffect(() => { setCurrentPage(1); }, [searchTerm, dispatchFilter, productFilter, stockStatusFilter, sortBy]);

  const totalPages   = Math.max(1, Math.ceil(dashboardItems.length / ITEMS_PER_PAGE));
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return dashboardItems.slice(start, start + ITEMS_PER_PAGE);
  }, [dashboardItems, currentPage]);

  /* ── modal open/close ─────────────────────────────────── */
  const openModal = (item) => setModalItem(item);
  const closeModal = () => setModalItem(null);

  const handleSaved = () => {
    loadItems();
    onSave?.();
    closeModal();
  };


  const handleExportExcel = () => {
    const exportData = dashboardItems.map(item => {
      const orderDate = item.sales_orders?.order_date ? format(new Date(item.sales_orders.order_date), 'dd MMM yyyy') : '';
      const godownsList = item.activePlans.length > 0
        ? [...new Set(item.activePlans.map(p => godowns.find(g => g.godown_id === p.godown_id)?.name).filter(Boolean))].join(', ')
        : 'Not Planned';

      return {
        'Order Date': orderDate,
        'Order No.': item.sales_orders?.order_number || '',
        'Customer': item.sales_orders?.customers?.name || '',
        'Type': item.sales_orders?.process_type || '',
        'Godown': godownsList,
        'Items': item.products?.name || '',
        'Total Qty': item.effectiveQty,
        'Pending Qty': item.remaining,
        'Dispatch Qty': item.totalDispatched,
        'Days Pending': item.daysPending,
        'Available Stock': item.productStock,
        'Dispatch Status': item.stockStatus ? STOCK_STATUS_META[item.stockStatus]?.label : '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pending_Dispatches");
    XLSX.writeFile(wb, "Pending_Dispatches.xlsx");
  };

  /* ── loading ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading dispatch items...</p>
      </div>
    );
  }

  if (filteredItems.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <ClipboardList size={32} className="text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-600 mb-1">No Dispatch Items</h3>
        <p className="text-sm text-slate-400">
          {searchTerm
            ? 'No items match your search.'
            : dispatchFilter === 'pending'
            ? 'All orders are fully planned.'
            : dispatchFilter === 'history'
            ? 'No planned dispatches yet.'
            : 'Create an order to start planning dispatches.'}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ── Dashboard summary cards (pending view only) ── */}
      {isPendingView && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <SummaryCard icon={ClipboardList} label="Total Pending Orders" value={summary.totalOrders} color="slate" />
          <SummaryCard icon={Package} label="Total Pending Bags" value={summary.totalBags} color="blue" />
          <SummaryCard icon={PackageCheck} label="Ready to Dispatch" value={summary.ready} color="emerald" />
          <SummaryCard icon={PackageX} label="Waiting for Stock" value={summary.waiting} color="red" />
        </div>
      )}

      {/* ── sort / filter controls (pending view only) ── */}
      {isPendingView && (
        <div className="flex flex-wrap items-center gap-2 mb-4 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium mr-1">
            <ArrowUpDown size={13} /> Sort
          </div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>

          <select
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
            className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All Products</option>
            {productOptions.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
          </select>

          <select
            value={stockStatusFilter}
            onChange={e => setStockStatusFilter(e.target.value)}
            className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All Stock Status</option>
            <option value="ready">Ready to Dispatch</option>
            <option value="partial">Partial Stock</option>
            <option value="waiting">Stock Shortage</option>
          </select>

          <div className="flex items-center gap-1.5 ml-auto">
            <label className="text-xs text-slate-400 font-medium whitespace-nowrap">Low qty threshold (bags)</label>
            <input
              type="number"
              min={1}
              value={lowQtyThreshold}
              onChange={e => setLowQtyThreshold(Math.max(1, Number(e.target.value) || 1))}
              className="h-8 w-16 px-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">

        {/* ── legend ── */}
        <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-400 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-200 inline-block" />Ordered</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-300 inline-block" />Planned</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-300 inline-block" />Dispatched</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-300 inline-block" />Remaining/Pending</span>
          {isPendingView && (
            <>
              <span className="text-slate-200">|</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Stock available</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Partial stock</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Stock shortage</span>
            </>
          )}

          <div className="ml-auto flex items-center gap-4">
            {dispatchFilter === 'pending' && dashboardItems.length > 0 && (
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                title="Export Pending Details to Excel"
              >
                <Download size={14} />
                <span className="font-medium">Export Excel</span>
              </button>
            )}
            <span className="font-medium text-slate-500">
              {dashboardItems.length} item{dashboardItems.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── item cards ── */}
        <div className="divide-y divide-slate-100">
          {currentItems.map(item => {
            const isExpanded   = expandedItems.has(item.item_id);
            const fullyPlanned = item.remaining <= 0;
            const hasPlans     = item.activePlans.length > 0;

            return (
              <div key={item.item_id} className="group">

                {/* ─ main row ─ */}
                <div className="flex items-start gap-4 px-4 py-4 hover:bg-slate-50 transition-colors">

                  {/* Left: order + product info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">
                        {item.sales_orders?.order_number || '—'}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-sm text-slate-600">
                        {item.products?.name}
                        <span className="text-xs text-slate-400 ml-1 uppercase">({item.products?.unit})</span>
                      </span>
                      {isPendingView && item.stockStatus && <StockStatusBadge status={item.stockStatus} />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-500">
                        {item.sales_orders?.customers?.name || '—'}
                      </span>
                      {item.sales_orders?.order_date && (
                        <>
                          <span className="text-slate-200 text-xs">·</span>
                          <span className="text-xs text-slate-400">
                            {format(new Date(item.sales_orders.order_date), 'dd/MM/yyyy')}
                          </span>
                        </>
                      )}
                      {isPendingView && (
                        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${
                          item.isOverdue
                            ? item.daysPending >= 15 ? 'bg-red-50 text-red-500 border-red-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                            : 'bg-slate-50 text-slate-400 border-slate-100'
                        }`}>
                          <Clock size={10} /> {item.daysPending}d {item.isOverdue ? 'Delay' : 'Pending'}
                        </span>
                      )}
                      {item.cancelledQty > 0 && (
                        <span className="text-[10px] text-red-400 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                          {item.cancelledQty} cancelled
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <ProgressBar
                      ordered={item.effectiveQty}
                      planned={item.totalPlanned}
                      dispatched={item.totalDispatched}
                    />
                  </div>

                  {/* Centre: quantity pills */}
                  <div className="flex items-center gap-2 shrink-0">
                    <QtyPill value={item.effectiveQty}    color="blue"    label="Ordered" />
                    <QtyPill value={item.totalPlanned}    color="emerald" label="Planned" />
                    <QtyPill value={item.totalDispatched} color="violet"  label="Dispatched" />
                    <QtyPill
                      value={item.remaining}
                      color={item.remaining > 0 ? 'amber' : 'slate'}
                      label="Remaining/Pending"
                    />
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {/* Plan / Edit button — always clickable */}
                    {fullyPlanned ? (
                      <button
                        type="button"
                        onClick={() => openModal(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 transition-colors"
                      >
                        <CheckCircle2 size={13} /> Fully Planned
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openModal(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 shadow-sm transition-all hover:shadow-md active:scale-95"
                      >
                        <Plus size={13} />
                        Plan Dispatch
                        <span className="ml-0.5 bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
                          {item.remaining} left
                        </span>
                      </button>
                    )}

                    {/* Toggle existing plans */}
                    {hasPlans && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.item_id)}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {isExpanded ? (
                          <><ChevronUp size={12} /> Hide plans</>
                        ) : (
                          <><ChevronDown size={12} /> {item.activePlans.length} plan{item.activePlans.length !== 1 ? 's' : ''}</>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* ─ expanded: existing plans sub-table ─ */}
                {isExpanded && hasPlans && (
                  <div className="bg-slate-50 border-t border-slate-100 px-4 pb-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 uppercase tracking-wide">
                          <th className="text-left py-2 pr-4 font-semibold">Dispatch No.</th>
                          <th className="text-center py-2 pr-4 font-semibold">Planned Qty</th>
                          <th className="text-center py-2 pr-4 font-semibold">Dispatched</th>
                          <th className="text-left py-2 pr-4 font-semibold">Date</th>
                          <th className="text-left py-2 pr-4 font-semibold">Godown</th>
                          <th className="text-left py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {item.activePlans.map(plan => {
                          const godown = godowns.find(g => g.godown_id === plan.godown_id);
                          return (
                            <tr key={plan.plan_id} className="hover:bg-white transition-colors">
                              <td className="py-2 pr-4 font-semibold text-slate-700">
                                {plan.dispatch_number || '—'}
                              </td>
                              <td className="py-2 pr-4 text-center font-medium text-slate-700">
                                {plan.quantity}
                              </td>
                              <td className="py-2 pr-4 text-center">
                                {plan.already_dispatched > 0 ? (
                                  <span className="text-violet-600 font-medium">{plan.already_dispatched}</span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                              <td className="py-2 pr-4 text-slate-500">
                                {plan.dispatch_date
                                  ? format(new Date(plan.dispatch_date), 'dd/MM/yyyy')
                                  : '—'}
                              </td>
                              <td className="py-2 pr-4 text-slate-600">
                                {godown?.name || '—'}
                              </td>
                              <td className="py-2">
                                <StatusBadge status={plan.dispatch_status} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Edit nudge */}
                    {item.activePlans.some(p => p.dispatch_status === 'Pending' || p.dispatch_status === 'Planned') && (
                      <p className="text-[10px] text-slate-400 mt-2 text-right">
                        Tip: click <strong>Plan Dispatch</strong> to edit pending plans or add a new partial plan.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── pagination ── */}
        {dashboardItems.length > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={dashboardItems.length}
            startIndex={(currentPage - 1) * ITEMS_PER_PAGE + 1}
            endIndex={Math.min(currentPage * ITEMS_PER_PAGE, dashboardItems.length)}
            onPageChange={setCurrentPage}
            className="border-t border-slate-200"
          />
        )}
      </div>

      {/* ── Smart Dispatch Planning (pending view only) ── */}
      {isPendingView && productPlans.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mt-4">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
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

          <div className="divide-y divide-slate-100">
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
                            <tr className="bg-slate-100 text-slate-600">
                              <th className="text-left px-3 py-2 font-semibold border-b border-slate-200">Date</th>
                              <th className="text-left px-3 py-2 font-semibold border-b border-slate-200">Order</th>
                              <th className="text-left px-3 py-2 font-semibold border-b border-slate-200">Party's Name</th>
                              <th className="text-left px-3 py-2 font-semibold border-b border-slate-200">Name of Item</th>
                              <th className="text-left px-3 py-2 font-semibold border-b border-slate-200">Godown</th>
                              <th className="text-right px-3 py-2 font-semibold border-b border-slate-200">Total Qty</th>
                              <th className="text-right px-3 py-2 font-semibold border-b border-slate-200">Dispatched</th>
                              <th className="text-right px-3 py-2 font-semibold border-b border-slate-200">Remaining</th>
                              <th className="text-right px-3 py-2 font-semibold border-b border-slate-200">Plan Qty</th>
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

      {/* ── Plan Dispatch Modal ── */}
      <PlanDispatchModal
        isOpen={!!modalItem}
        onClose={closeModal}
        item={modalItem}
        godowns={godowns}
        user={user}
        onSave={handleSaved}
      />
    </>
  );
};

export default DispatchPlanningTable;
