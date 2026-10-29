import { getAllProductStock, getAllProducts, getAllGodowns } from '../services/masterService';
import { getReorderStatusItems, getPackagingSize } from '../services/purchaseService';
import { getDispatchTransactions } from '../services/salesService';

// Ultimate IMS figures, shared by the Ultimate IMS page and the per-product
// IMS popup (Sales → Dispatch Planning / Dispatch Completed), so both always
// show the exact same numbers.

const getTodayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Deliveries land here once the transporter/vendor has actually dropped the
// stock at a godown — anything else (In Transit, At TPT Gdn, ...) is still
// moving, so it counts toward "In Transit Qty" instead of "received".
export const isReceivedStatus = (status) => status === 'Arrived' || status === 'Received';

// Avg Dispatch = total dispatched qty / days from the first dispatch through
// today, counting both ends (a first dispatch today = 1 day, not 0).
export const getAvgDispatch = (totalQty, firstDate) => {
  if (!firstDate || !totalQty) return null;
  const days = Math.round((Date.parse(getTodayLocal()) - Date.parse(firstDate)) / 86400000) + 1;
  return totalQty / Math.max(1, days);
};

// Max Level = Lead Time × Safety Factor × AVG Daily Consumption (product's
// master unit). Blank until both Lead Time and Safety Factor are set.
export const getMaxLevel = (leadTime, safetyFactor, avgDaily) => {
  if (leadTime === '' || leadTime == null || safetyFactor === '' || safetyFactor == null) return null;
  return (Number(leadTime) || 0) * (Number(safetyFactor) || 0) * (Number(avgDaily) || 0);
};

// Current Stock colour code, judged against the row's Max Level:
// red = out of stock / below half of Max Level, amber = below Max Level,
// green = at or above Max Level. Without a Max Level only "out" is flagged.
export const STOCK_LEVEL_STYLES = {
  // Soft (dimmed) cell tints — the whole Current Stock cell is shaded.
  critical: { className: 'bg-red-50/70 text-red-600', label: 'Critical — out of stock or below 50% of Max Level' },
  low: { className: 'bg-amber-50/70 text-amber-600', label: 'Low — below Max Level' },
  healthy: { className: 'bg-emerald-50/70 text-emerald-600', label: 'Healthy — at or above Max Level' },
  neutral: { className: 'text-slate-900', label: 'Set Lead Time and Safety Factor to get a Max Level' },
};

export const getStockLevel = (stock, maxLevel) => {
  const qty = Number(stock) || 0;
  if (qty <= 0) return 'critical';
  if (maxLevel == null || maxLevel <= 0) return 'neutral';
  if (qty < maxLevel * 0.5) return 'critical';
  if (qty < maxLevel) return 'low';
  return 'healthy';
};

const EMPTY_TOTALS = () => ({
  currentStock: 0, pendingApprovalQty: 0, approvedQty: 0,
  inTransitQty: 0, totalOrderedQty: 0, totalReceivedQty: 0,
  orderPendingQty: 0, dispatchedQty: 0, firstDispatchDate: null,
});

/**
 * Fetches everything Ultimate IMS needs and builds one row per product, each
 * with per-godown `stats` (current stock, approval pending, approved, in
 * transit, order pending, dispatched). Returns { rows, godowns }.
 */
export const fetchImsRows = async () => {
  const [stockRows, products, godownList, indentItems, dispatchTxns] = await Promise.all([
    getAllProductStock(),
    getAllProducts(),
    getAllGodowns(),
    getReorderStatusItems(),
    getDispatchTransactions(),
  ]);

  const productMap = new Map(products.map((p) => [p.product_id, p]));
  const godownMap = new Map(godownList.map((g) => [g.godown_id, g]));

  // One group per Product
  const groups = new Map();
  for (const p of products) {
    groups.set(p.product_id, { key: p.product_id, productId: p.product_id, godownStats: new Map() });
  }

  const getGodownStats = (productId, godownId) => {
    if (!groups.has(productId)) {
      groups.set(productId, { key: productId, productId, godownStats: new Map() });
    }
    const group = groups.get(productId);
    if (!group.godownStats.has(godownId)) {
      group.godownStats.set(godownId, { godownId, ...EMPTY_TOTALS() });
    }
    return group.godownStats.get(godownId);
  };

  // Current Stock is own-godown stock only. A lift sitting "In Transport
  // Godown" is booked against the transporter's own godown until it's
  // marked Arrived — it hasn't reached us yet, and it's already counted
  // under In Transit (see the delivery loop below), so counting that
  // godown's stock here too would show it as received.
  const isTransporterGodown = (godownId) => {
    const g = godownMap.get(godownId);
    return !!g && (g.godown_type || 'Own') !== 'Own';
  };

  for (const s of stockRows) {
    if (!s.product_id || !s.godown_id) continue;
    if (isTransporterGodown(s.godown_id)) continue;
    getGodownStats(s.product_id, s.godown_id).currentStock += Number(s.current_stock) || 0;
  }

  for (const t of dispatchTxns) {
    if (!t.product_id || !t.godown_id) continue;
    const s = getGodownStats(t.product_id, t.godown_id);
    s.dispatchedQty += Number(t.qty) || 0;
    const date = String(t.txn_date || '').slice(0, 10);
    if (date && (!s.firstDispatchDate || date < s.firstDispatchDate)) s.firstDispatchDate = date;
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
    // Direct items are Planned at creation (see createIndent) but, like
    // every indent, still wait for sign-off in Vendor Approval.
    const isPlanned = isDirect || item.planning_status === 'Planned';
    const isApproved = item.approval_status === 'Approved';

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

    // Order Pending Qty == same items as Purchase > Indent > Pending
    // (not yet vendor/rate/qty/date planned). Approval Pending Purchase
    // Qty == same items as Vendor Approval > Pending (already planned,
    // still awaiting sign-off). Once approved, it's all Approval Qty.
    if (!isPlanned) {
      stats.orderPendingQty += qty;
    } else if (!isApproved) {
      stats.pendingApprovalQty += qty;
    } else {
      stats.approvedQty += Math.max(0, qty - totalDeliveredForThisItem);
    }
  }

  const rows = Array.from(groups.values()).map((g) => {
    const prod = productMap.get(g.productId);
    const statsArray = Array.from(g.godownStats.values()).map(st => ({
      ...st,
      godownName: godownMap.get(st.godownId)?.name || 'Unassigned Godown',
      godownType: godownMap.get(st.godownId)?.godown_type || 'Own',
    }));
    return {
      key: g.productId,
      productId: g.productId,
      groupId: prod?.group_id || null,
      productName: prod?.name || 'Unassigned Product',
      unit: prod?.unit || '—',
      packagingSize: getPackagingSize(prod),
      leadTime: prod?.lead_time ?? '',
      safetyFactor: prod?.safety_factor ?? '',
      stats: statsArray,
    };
  }).sort((a, b) => a.productName.localeCompare(b.productName));

  return { rows, godowns: godownList };
};

// Sums a row's per-godown stats (all of them, or just `stats` passed in)
// into one set of totals, plus AVG Daily Consumption.
export const sumImsStats = (stats) => {
  const totals = EMPTY_TOTALS();
  for (const st of stats) {
    totals.dispatchedQty += st.dispatchedQty || 0;
    if (st.firstDispatchDate && (!totals.firstDispatchDate || st.firstDispatchDate < totals.firstDispatchDate)) {
      totals.firstDispatchDate = st.firstDispatchDate;
    }
    totals.currentStock += st.currentStock;
    totals.pendingApprovalQty += st.pendingApprovalQty;
    totals.approvedQty += st.approvedQty;
    totals.inTransitQty += st.inTransitQty;
    totals.totalOrderedQty += st.totalOrderedQty;
    totals.totalReceivedQty += st.totalReceivedQty;
    totals.orderPendingQty += (st.orderPendingQty || 0);
  }
  return { ...totals, avgDispatch: getAvgDispatch(totals.dispatchedQty, totals.firstDispatchDate) };
};
