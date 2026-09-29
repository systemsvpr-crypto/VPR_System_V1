import { supabase, fetchAllRows, fetchAllRowsWithCount } from '../supabase';

export const getAllGodowns = async () => {
  const { data, error } = await supabase
    .from('godowns')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
};

// product_ids of every product in a Product Group whose name contains "sheet"
// (case-insensitive). Two plain queries rather than an embedded join, so it
// doesn't depend on PostgREST resolving the products -> product_groups FK.
const getSheetProductIds = async (signal) => {
  const { data: groups, error } = await supabase
    .from('product_groups')
    .select('group_id')
    .ilike('group_name', '%sheet%')
    .abortSignal(signal);
  if (error) throw error;
  const groupIds = (groups || []).map(g => g.group_id);
  if (groupIds.length === 0) return [];
  const products = await fetchAllRows(() => supabase
    .from('products')
    .select('product_id')
    .in('group_id', groupIds)
    .abortSignal(signal));
  return (products || []).map(p => p.product_id);
};

export const getGodownSummary = async (date, signal) => {
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().split('T')[0];

  const [
    godowns,
    balances,
    stockIns,
    stockOuts,
    openingStocks,
    transportDeliveries,
    sheetProducts,
  ] = await Promise.all([
    getAllGodowns(),
    fetchAllRows(() => supabase
      .from('transactions')
      .select('product_id, godown_id, qty, txn_type')
      .eq('is_void', false)
      .lte('txn_date', prevDateStr)
      .abortSignal(signal)),
    fetchAllRows(() => supabase
      .from('transactions')
      .select('product_id, godown_id, qty')
      .eq('is_void', false)
      .eq('txn_date', date)
      .in('txn_type', ['IN_FACTORY', 'PRODUCTION_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PURCHASE_IN'])
      .abortSignal(signal)),
    fetchAllRows(() => supabase
      .from('transactions')
      .select('product_id, godown_id, qty')
      .eq('is_void', false)
      .eq('txn_date', date)
      .in('txn_type', ['OUT_GODOWN', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'])
      .abortSignal(signal)),
    fetchAllRows(() => supabase
      .from('transactions')
      .select('product_id, godown_id, qty')
      .eq('is_void', false)
      .eq('txn_date', date)
      .eq('txn_type', 'OPEN_STOCK')
      .abortSignal(signal)),
    fetchAllRows(() => supabase
      .from('purchase_deliveries')
      .select('received_quantity, transporters:transporter_id(name)')
      .in('status', ['In Transport Godown', 'AT TPT GDN'])
      .abortSignal(signal)),
    getSheetProductIds(signal),
  ]);

  // Products whose Product Group name contains "sheet" are physically kept in
  // the "Godown" godown, but are reported as their own "Sheet" row here —
  // their Godown transactions are re-keyed onto a virtual godown id so the
  // Godown row no longer includes them. Totals are unaffected.
  const SHEET_GODOWN_ID = 'virtual-sheet';
  const sheetProductIds = new Set(sheetProducts);
  const mainGodown = godowns.find(g => g.name?.trim().toLowerCase() === 'godown');
  const godownKeyOf = (txn) => (
    mainGodown && txn.godown_id === mainGodown.godown_id && sheetProductIds.has(txn.product_id)
      ? SHEET_GODOWN_ID
      : txn.godown_id
  );

  const openingMap = {};
  for (const txn of balances || []) {
    const gid = godownKeyOf(txn);
    if (['OPEN_STOCK', 'IN_FACTORY', 'PRODUCTION_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PURCHASE_IN'].includes(txn.txn_type)) {
      openingMap[gid] = (openingMap[gid] || 0) + Number(txn.qty);
    } else {
      openingMap[gid] = (openingMap[gid] || 0) - Number(txn.qty);
    }
  }
  for (const txn of openingStocks || []) {
    const gid = godownKeyOf(txn);
    openingMap[gid] = (openingMap[gid] || 0) + Number(txn.qty);
  }

  const stockInMap = {};
  for (const txn of stockIns || []) {
    const gid = godownKeyOf(txn);
    stockInMap[gid] = (stockInMap[gid] || 0) + Number(txn.qty);
  }

  const stockOutMap = {};
  for (const txn of stockOuts || []) {
    const gid = godownKeyOf(txn);
    stockOutMap[gid] = (stockOutMap[gid] || 0) + Number(txn.qty);
  }

  const buildRow = (godownId, godownName, godownType) => ({
    godownId,
    godownName,
    godownType,
    opening: openingMap[godownId] || 0,
    stockIn: stockInMap[godownId] || 0,
    stockOut: stockOutMap[godownId] || 0,
    closing: (openingMap[godownId] || 0) + (stockInMap[godownId] || 0) - (stockOutMap[godownId] || 0),
  });

  const rows = [];
  for (const g of godowns) {
    rows.push(buildRow(g.godown_id, g.name, g.godown_type || ''));
    // Sheet row sits directly under the Godown it was split out of.
    if (mainGodown && g.godown_id === mainGodown.godown_id) {
      rows.push(buildRow(SHEET_GODOWN_ID, 'Sheet', g.godown_type || 'Own'));
    }
  }

  // Transport Godown stock is shown on its own "Transport Godown Stock" tab —
  // it isn't a real godown, so it's excluded from this Godown Summary table/totals.
  let totalTransportQty = 0;
  for (const d of transportDeliveries || []) {
    totalTransportQty += Number(d.received_quantity || 0);
  }

  const totals = rows.reduce((acc, r) => ({
    opening: acc.opening + r.opening,
    stockIn: acc.stockIn + r.stockIn,
    stockOut: acc.stockOut + r.stockOut,
    closing: acc.closing + r.closing,
  }), { opening: 0, stockIn: 0, stockOut: 0, closing: 0 });

  return { godowns: rows, totals, transportTotal: totalTransportQty };
};

export const getDashboardData = async (date, signal, options = {}) => {
  const { page = 1, pageSize = 10, search, all = false } = options;

  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().split('T')[0];

  const todayStr = new Date().toISOString().split('T')[0];

  let productsQuery = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .order('name', { ascending: true });

  if (search) {
    productsQuery = productsQuery.ilike('name', `%${search}%`);
  } else if (!all) {
    productsQuery = productsQuery.range((page - 1) * pageSize, page * pageSize - 1);
  }

  // `allBalances` (everything up to the day before the report date) and what
  // used to be a separate `currentBalances` query (everything up to today)
  // are near-duplicate full-history scans — todayStr is normally >= prevDateStr,
  // so the old currentBalances query re-fetched almost all of allBalances on
  // top of it. Fetching the wider range once (up to whichever cutoff is later)
  // and splitting it client-side by txn_date halves that transfer/scan cost.
  const balanceCutoffStr = prevDateStr > todayStr ? prevDateStr : todayStr;

  // Builds the 4 transaction queries, optionally scoped to a specific list of
  // product_ids. When exporting "all" with no search, every product is
  // included anyway, so scoping by product_id is a no-op that only bloats the
  // query string — passing `null` skips it entirely, which also means these
  // queries don't need to wait on the products query to know which IDs to
  // filter by, so they can be fired in the SAME round trip (see below)
  // instead of a second one after products resolves.
  // Each query is wrapped in fetchAllRows so it pages past Supabase's
  // default 1000-row-per-request cap instead of silently truncating once the
  // ledger (or a single day's worth of postings) grows past that — see
  // fetchAllRows in ../supabase for why. fetchAllRows resolves straight to
  // the row array (no {data,error} wrapper), which is why the callers below
  // read these results directly rather than via `.data`.
  const buildTxnQueries = (productIds) => {
    const scoped = (q) => (productIds ? q.in('product_id', productIds) : q);
    return [
      fetchAllRows(() => scoped(
        supabase
          .from('transactions')
          .select('product_id, godown_id, qty, txn_type, txn_date')
          .eq('is_void', false)
          .lte('txn_date', balanceCutoffStr)
      ).abortSignal(signal)),
      fetchAllRows(() => scoped(
        supabase
          .from('transactions')
          .select('product_id, godown_id, qty')
          .eq('is_void', false)
          .eq('txn_date', date)
          .in('txn_type', ['IN_FACTORY', 'PRODUCTION_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PURCHASE_IN'])
      ).abortSignal(signal)),
      fetchAllRows(() => scoped(
        supabase
          .from('transactions')
          .select('product_id, godown_id, qty')
          .eq('is_void', false)
          .eq('txn_date', date)
          .in('txn_type', ['OUT_GODOWN', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'])
      ).abortSignal(signal)),
      fetchAllRows(() => scoped(
        supabase
          .from('transactions')
          .select('product_id, godown_id, qty')
          .eq('is_void', false)
          .eq('txn_date', date)
          .eq('txn_type', 'OPEN_STOCK')
      ).abortSignal(signal)),
    ];
  };

  let godowns, products, count, allBalances, allStockIns, allStockOuts, openingStocks;

  if (all && !search) {
    // Export path: nothing downstream needs to wait on the product list, so
    // fire every query in one concurrent wave — cuts a full network
    // round-trip versus fetching products first, then transactions.
    // No `.range()` was applied to productsQuery above (this is the "all"
    // export path), so it must page past the 1000-row cap itself too, or a
    // catalog that grows past 1000 products silently loses rows off the end
    // of every full export.
    const [godownsRes, productsRes, balancesRes, stockInsRes, stockOutsRes, openingRes] = await Promise.all([
      getAllGodowns(),
      fetchAllRowsWithCount(() => productsQuery),
      ...buildTxnQueries(null),
    ]);
    godowns = godownsRes;
    products = productsRes.data;
    count = productsRes.count;
    allBalances = balancesRes;
    allStockIns = stockInsRes;
    allStockOuts = stockOutsRes;
    openingStocks = openingRes;
  } else {
    // Paginated / searched dashboard view — the transaction queries must be
    // scoped to this page's exact product_id list, which isn't known until
    // the products query resolves, so this stays two sequential round trips.
    // A search has no `.range()` on productsQuery (it's meant to return every
    // match, not one page of them), so it needs the same full-fetch pagination
    // as the export path above; a plain (unsearched) page listing already has
    // its own `.range()` and stays a single bounded fetch.
    const productsPromise = search ? fetchAllRowsWithCount(() => productsQuery) : productsQuery;
    const [godownsRes, productsRes] = await Promise.all([getAllGodowns(), productsPromise]);
    godowns = godownsRes;
    products = productsRes.data;
    count = productsRes.count;

    if (!products || products.length === 0) {
      return { data: [], hasMore: false, total: 0 };
    }

    const productIds = products.map(p => p.product_id);
    const [balancesRes, stockInsRes, stockOutsRes, openingRes] = await Promise.all(buildTxnQueries(productIds));
    allBalances = balancesRes;
    allStockIns = stockInsRes;
    allStockOuts = stockOutsRes;
    openingStocks = openingRes;
  }

  if (!products || products.length === 0) {
    return { data: [], hasMore: false, total: 0 };
  }

  const balanceMap = {};
  const currentBalanceMap = {};
  for (const txn of allBalances || []) {
    const key = `${txn.product_id}|${txn.godown_id}`;
    const delta = ['OPEN_STOCK', 'IN_FACTORY', 'PRODUCTION_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PURCHASE_IN'].includes(txn.txn_type)
      ? Number(txn.qty)
      : -Number(txn.qty);
    if (txn.txn_date <= prevDateStr) balanceMap[key] = (balanceMap[key] || 0) + delta;
    if (txn.txn_date <= todayStr) currentBalanceMap[key] = (currentBalanceMap[key] || 0) + delta;
  }

  for (const txn of openingStocks || []) {
    const key = `${txn.product_id}|${txn.godown_id}`;
    balanceMap[key] = (balanceMap[key] || 0) + Number(txn.qty);
  }

  const stockInMap = {};
  for (const txn of allStockIns || []) {
    const key = `${txn.product_id}|${txn.godown_id}`;
    stockInMap[key] = (stockInMap[key] || 0) + Number(txn.qty);
  }

  const stockOutMap = {};
  for (const txn of allStockOuts || []) {
    const key = `${txn.product_id}|${txn.godown_id}`;
    stockOutMap[key] = (stockOutMap[key] || 0) + Number(txn.qty);
  }

  const result = [];
  for (const product of products) {
    const godownRows = [];
    let totalOpening = 0;
    let totalStockIn = 0;
    let totalStockOut = 0;
    let totalCurrent = 0;

    for (const godown of godowns) {
      const key = `${product.product_id}|${godown.godown_id}`;
      const opening = balanceMap[key] || 0;
      const stockIn = stockInMap[key] || 0;
      const stockOut = stockOutMap[key] || 0;
      const closing = opening + stockIn - stockOut;
      const current = currentBalanceMap[key] || 0;

      godownRows.push({
        godownId: godown.godown_id,
        godownName: godown.name,
        godownType: godown.godown_type || '',
        opening,
        stockIn,
        stockOut,
        closing,
        current,
      });

      totalOpening += opening;
      totalStockIn += stockIn;
      totalStockOut += stockOut;
      totalCurrent += current;
    }

    result.push({
      productId: product.product_id,
      productName: product.name,
      unit: product.unit,
      category: product.category || '',
      brandName: product.brand_name || '',
      productType: product.product_type || '',
      mux: product.mux || '',
      godowns: godownRows,
      totals: {
        opening: totalOpening,
        stockIn: totalStockIn,
        stockOut: totalStockOut,
        closing: totalOpening + totalStockIn - totalStockOut,
        current: totalCurrent,
      },
    });
  }

  return {
    data: result,
    hasMore: page * pageSize < count,
    total: count,
  };
};
