import { supabase } from '../supabase';

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

  const [godowns, { data: balances }, { data: stockIns }, { data: stockOuts }, { data: openingStocks }] = await Promise.all([
    getAllGodowns(),
    supabase
      .from('transactions')
      .select('godown_id, qty, txn_type')
      .eq('is_void', false)
      .lte('txn_date', prevDateStr)
      .abortSignal(signal),
    supabase
      .from('transactions')
      .select('godown_id, qty')
      .eq('is_void', false)
      .eq('txn_date', date)
      .in('txn_type', ['IN_FACTORY', 'TRANSFER_IN', 'ADJUSTMENT_IN'])
      .abortSignal(signal),
    supabase
      .from('transactions')
      .select('godown_id, qty')
      .eq('is_void', false)
      .eq('txn_date', date)
      .in('txn_type', ['OUT_GODOWN', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'])
      .abortSignal(signal),
    supabase
      .from('transactions')
      .select('godown_id, qty')
      .eq('is_void', false)
      .eq('txn_date', date)
      .eq('txn_type', 'OPEN_STOCK')
      .abortSignal(signal),
  ]);

  const openingMap = {};
  for (const txn of balances || []) {
    const gid = txn.godown_id;
    if (['OPEN_STOCK', 'IN_FACTORY', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(txn.txn_type)) {
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
    opening: openingMap[g.godown_id] || 0,
    stockIn: stockInMap[g.godown_id] || 0,
    stockOut: stockOutMap[g.godown_id] || 0,
    closing: (openingMap[g.godown_id] || 0) + (stockInMap[g.godown_id] || 0) - (stockOutMap[g.godown_id] || 0),
  }));

  const totals = rows.reduce((acc, r) => ({
    opening: acc.opening + r.opening,
    stockIn: acc.stockIn + r.stockIn,
    stockOut: acc.stockOut + r.stockOut,
    closing: acc.closing + r.closing,
  }), { opening: 0, stockIn: 0, stockOut: 0, closing: 0 });

  return { godowns: rows, totals };
};

export const getDashboardData = async (date, signal, options = {}) => {
  const { page = 1, pageSize = 10, search } = options;

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
  } else {
    productsQuery = productsQuery.range((page - 1) * pageSize, page * pageSize - 1);
  }

  const [godowns, { data: products, count }] = await Promise.all([
    getAllGodowns(),
    productsQuery,
  ]);

  if (!products || products.length === 0) {
    return { data: [], hasMore: false, total: 0 };
  }

  const productIds = products.map(p => p.product_id);

  const [
    { data: allBalances },
    { data: allStockIns },
    { data: allStockOuts },
    { data: openingStocks },
    { data: currentBalances },
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('product_id, godown_id, qty, txn_type')
      .eq('is_void', false)
      .lte('txn_date', prevDateStr)
      .in('product_id', productIds)
      .abortSignal(signal),
    supabase
      .from('transactions')
      .select('product_id, godown_id, qty')
      .eq('is_void', false)
      .eq('txn_date', date)
      .in('txn_type', ['IN_FACTORY', 'TRANSFER_IN', 'ADJUSTMENT_IN'])
      .in('product_id', productIds)
      .abortSignal(signal),
    supabase
      .from('transactions')
      .select('product_id, godown_id, qty')
      .eq('is_void', false)
      .eq('txn_date', date)
      .in('txn_type', ['OUT_GODOWN', 'TRANSFER_OUT', 'ADJUSTMENT_OUT'])
      .in('product_id', productIds)
      .abortSignal(signal),
    supabase
      .from('transactions')
      .select('product_id, godown_id, qty')
      .eq('is_void', false)
      .eq('txn_date', date)
      .eq('txn_type', 'OPEN_STOCK')
      .in('product_id', productIds)
      .abortSignal(signal),
    supabase
      .from('transactions')
      .select('product_id, godown_id, qty, txn_type')
      .eq('is_void', false)
      .lte('txn_date', todayStr)
      .in('product_id', productIds)
      .abortSignal(signal),
  ]);

  const balanceMap = {};
  for (const txn of allBalances || []) {
    const key = `${txn.product_id}|${txn.godown_id}`;
    if (['OPEN_STOCK', 'IN_FACTORY', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(txn.txn_type)) {
      balanceMap[key] = (balanceMap[key] || 0) + Number(txn.qty);
    } else {
      balanceMap[key] = (balanceMap[key] || 0) - Number(txn.qty);
    }
  }

  for (const txn of openingStocks || []) {
    const key = `${txn.product_id}|${txn.godown_id}`;
    balanceMap[key] = (balanceMap[key] || 0) + Number(txn.qty);
  }

  const currentBalanceMap = {};
  for (const txn of currentBalances || []) {
    const key = `${txn.product_id}|${txn.godown_id}`;
    if (['OPEN_STOCK', 'IN_FACTORY', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(txn.txn_type)) {
      currentBalanceMap[key] = (currentBalanceMap[key] || 0) + Number(txn.qty);
    } else {
      currentBalanceMap[key] = (currentBalanceMap[key] || 0) - Number(txn.qty);
    }
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
