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
  ] = await Promise.all([
    getAllGodowns(),
    fetchAllRows(() => supabase
      .from('transactions')
      .select('godown_id, qty, txn_type')
      .eq('is_void', false)
      .lte('txn_date', prevDateStr)
      .abortSignal(signal)),
    fetchAllRows(() => supabase
      .from('transactions')
      .select('godown_id, qty')
      .eq('is_void', false)
      .eq('txn_date', date)
      .in('txn_type', ['IN_FACTORY', 'PRODUCTION_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PURCHASE_IN'])
      .abortSignal(signal)),
    fetchAllRows(() => supabase
      .from('transactions')
      .select('godown_id, qty')
      .eq('is_void', false)
      .eq('txn_date', date)
      .in('txn_type', ['OUT_GODOWN', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'])
      .abortSignal(signal)),
    fetchAllRows(() => supabase
      .from('transactions')
      .select('godown_id, qty')
      .eq('is_void', false)
      .eq('txn_date', date)
      .eq('txn_type', 'OPEN_STOCK')
      .abortSignal(signal)),
    fetchAllRows(() => supabase
      .from('purchase_deliveries')
      .select('received_quantity, transporters:transporter_id(name)')
      .in('status', ['In Transport Godown', 'AT TPT GDN'])
      .abortSignal(signal)),
  ]);

  const openingMap = {};
  for (const txn of balances || []) {
    const gid = txn.godown_id;
    if (['OPEN_STOCK', 'IN_FACTORY', 'PRODUCTION_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PURCHASE_IN'].includes(txn.txn_type)) {
      openingMap[gid] = (openingMap[gid] || 0) + Number(txn.qty);
    } else {
      openingMap[gid] = (openingMap[gid] || 0) - Number(txn.qty);
    }
  }
  for (const txn of openingStocks || []) {
    const gid = txn.godown_id;
    openingMap[gid] = (openingMap[gid] || 0) + Number(txn.qty);
  }

  const stockInMap = {};
  for (const txn of stockIns || []) {
    stockInMap[txn.godown_id] = (stockInMap[txn.godown_id] || 0) + Number(txn.qty);
  }

  const stockOutMap = {};
  for (const txn of stockOuts || []) {
    stockOutMap[txn.godown_id] = (stockOutMap[txn.godown_id] || 0) + Number(txn.qty);
  }

  const rows = godowns.map(g => ({
    godownId: g.godown_id,
    godownName: g.name,
    godownType: g.godown_type || '',
    opening: openingMap[g.godown_id] || 0,
    stockIn: stockInMap[g.godown_id] || 0,
    stockOut: stockOutMap[g.godown_id] || 0,
    closing: (openingMap[g.godown_id] || 0) + (stockInMap[g.godown_id] || 0) - (stockOutMap[g.godown_id] || 0),
  }));

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
