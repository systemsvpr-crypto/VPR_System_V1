import { supabase } from '../supabase';

export const getStockBalanceBeforeTxn = async (productId, godownId, txnId, txnDate) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('txn_id, qty, txn_type, created_at')
    .eq('product_id', productId)
    .eq('godown_id', godownId)
    .eq('is_void', false)
    .lte('txn_date', txnDate)
    .order('txn_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  let balance = 0;
  for (const row of data || []) {
    if (row.txn_id === txnId) return balance;
    const inc = ['OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN'].includes(row.txn_type) ? Number(row.qty) : -Number(row.qty);
    balance += inc;
  }
  return balance;
};

export const getStockBalance = async (productId, godownId) => {
  const { data, error } = await supabase
    .from('godown_stock')
    .select('current_stock')
    .eq('product_id', productId)
    .eq('godown_id', godownId)
    .maybeSingle();
  if (error) throw error;
  return data?.current_stock ?? 0;
};

export const getProduct = async (productId) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('product_id', productId)
    .single();
  if (error) throw error;
  return data;
};

export const getGodown = async (godownId) => {
  const { data, error } = await supabase
    .from('godowns')
    .select('*')
    .eq('godown_id', godownId)
    .single();
  if (error) throw error;
  return data;
};

export const addFactoryStock = async ({ product_id, godown_id, qty, txn_date, created_by }) => {
  if (!qty || Number(qty) <= 0) throw new Error('Quantity must be greater than zero.');
  if (!Number.isInteger(Number(qty))) throw new Error('Quantity must be a whole number.');
  if (new Date(txn_date) > new Date(new Date().toDateString())) throw new Error('Transaction date cannot be in the future.');

  const { data: product, error: prodErr } = await supabase
    .from('products')
    .select('product_id')
    .eq('product_id', product_id)
    .single();
  if (prodErr) throw new Error('Product not found.');

  const { data: godown, error: godErr } = await supabase
    .from('godowns')
    .select('godown_id, is_active')
    .eq('godown_id', godown_id)
    .single();
  if (godErr) throw new Error('Godown not found.');
  if (!godown.is_active) throw new Error('Godown is inactive.');

  const back_dated = new Date(txn_date) < new Date(new Date().toDateString());

  const { data, error } = await supabase
    .from('transactions')
    .insert([{
      product_id, godown_id, txn_date, txn_type: 'IN_FACTORY',
      qty: Number(qty), is_void: false, created_by, back_dated,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const transferStock = async ({ product_id, from_godown_id, to_godown_id, qty, txn_date, created_by }) => {
  if (!qty || Number(qty) <= 0) throw new Error('Quantity must be greater than zero.');
  if (!Number.isInteger(Number(qty))) throw new Error('Quantity must be a whole number.');
  if (new Date(txn_date) > new Date(new Date().toDateString())) throw new Error('Transaction date cannot be in the future.');
  if (from_godown_id === to_godown_id) throw new Error('Source and destination godowns must be different.');

  const available = await getStockBalance(product_id, from_godown_id);
  if (available < Number(qty)) throw new Error(`Cannot transfer ${qty} units. Available stock: ${available}.`);

  const { data: destGodown } = await supabase
    .from('godowns')
    .select('is_active')
    .eq('godown_id', to_godown_id)
    .single();
  if (!destGodown?.is_active) throw new Error('Destination godown is inactive.');

  const pair_id = crypto.randomUUID();
  const back_dated = new Date(txn_date) < new Date(new Date().toDateString());

  const { data, error } = await supabase
    .from('transactions')
    .insert([
      {
        product_id, godown_id: from_godown_id, txn_date,
        txn_type: 'TRANSFER_OUT', qty: Number(qty),
        is_void: false, pair_id, created_by, back_dated,
      },
      {
        product_id, godown_id: to_godown_id, txn_date,
        txn_type: 'TRANSFER_IN', qty: Number(qty),
        is_void: false, pair_id, created_by, back_dated,
      },
    ])
    .select();
  if (error) throw error;
  return data;
};

export const dispatchStock = async ({ product_id, godown_id, qty, txn_date, created_by }) => {
  if (!qty || Number(qty) <= 0) throw new Error('Quantity must be greater than zero.');
  if (!Number.isInteger(Number(qty))) throw new Error('Quantity must be a whole number.');
  if (new Date(txn_date) > new Date(new Date().toDateString())) throw new Error('Transaction date cannot be in the future.');

  const product = await getProduct(product_id);
  const available = await getStockBalance(product_id, godown_id);

  if (available < Number(qty) && !product.allow_negative_stock) {
    throw new Error(`Insufficient stock. Available: ${available}, Requested: ${qty}. Entry blocked.`);
  }

  const back_dated = new Date(txn_date) < new Date(new Date().toDateString());

  const { data, error } = await supabase
    .from('transactions')
    .insert([{
      product_id, godown_id, txn_date, txn_type: 'OUT_GODOWN',
      qty: Number(qty), is_void: false, created_by, back_dated,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const runFSG = async (productId, godownId, fromDate, { removeTxnIds = [], addRows = [] }) => {
  const product = await getProduct(productId);

  const { data: anchorRows } = await supabase
    .from('transactions')
    .select('qty, txn_type')
    .eq('product_id', productId)
    .eq('godown_id', godownId)
    .eq('is_void', false)
    .lt('txn_date', fromDate);

  const anchorBalance = (anchorRows || []).reduce((sum, r) => {
    return sum + (['OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN'].includes(r.txn_type) ? Number(r.qty) : -Number(r.qty));
  }, 0);

  const { data: futureRows } = await supabase
    .from('transactions')
    .select('*')
    .eq('product_id', productId)
    .eq('godown_id', godownId)
    .eq('is_void', false)
    .gte('txn_date', fromDate)
    .order('txn_date', { ascending: true })
    .order('created_at', { ascending: true });

  const remaining = (futureRows || []).filter(r => !removeTxnIds.includes(r.txn_id));
  const merged = [...remaining, ...addRows];

  merged.sort((a, b) => {
    if (a.txn_date !== b.txn_date) return a.txn_date < b.txn_date ? -1 : 1;
    const aOs = a.txn_type === 'OPEN_STOCK' ? 0 : 1;
    const bOs = b.txn_type === 'OPEN_STOCK' ? 0 : 1;
    if (aOs !== bOs) return aOs - bOs;
    return (a.created_at || '') < (b.created_at || '') ? -1 : 1;
  });

  let running = anchorBalance;
  for (const row of merged) {
    const inc = ['OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN'].includes(row.txn_type) ? Number(row.qty) : -Number(row.qty);
    running += inc;
    if (running < 0 && !product.allow_negative_stock) {
      return {
        passed: false,
        message: `This change would make txn #${String(row.txn_id).substring(0, 8)} (${row.txn_type.replace(/_/g, ' ')} of ${Number(row.qty).toFixed(0)} on ${row.txn_date}) invalid — balance would reach ${running.toFixed(0)}. Please resolve that entry first.`,
        failingRow: { ...row, runningBalance: running },
      };
    }
  }

  return { passed: true };
};

export const getAffectedTransactionsImpact = async (productId, godownId, fromDate, { removeTxnIds = [], addRows = [] }) => {
  const product = await getProduct(productId);

  const { data: anchorRows } = await supabase
    .from('transactions')
    .select('qty, txn_type')
    .eq('product_id', productId)
    .eq('godown_id', godownId)
    .eq('is_void', false)
    .lt('txn_date', fromDate);

  const anchorBalance = (anchorRows || []).reduce((sum, r) => {
    return sum + (['OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN'].includes(r.txn_type) ? Number(r.qty) : -Number(r.qty));
  }, 0);

  const { data: futureRows } = await supabase
    .from('transactions')
    .select('*')
    .eq('product_id', productId)
    .eq('godown_id', godownId)
    .eq('is_void', false)
    .gte('txn_date', fromDate)
    .order('txn_date', { ascending: true })
    .order('created_at', { ascending: true });

  const remaining = (futureRows || []).filter(r => !removeTxnIds.includes(r.txn_id));
  const merged = [...remaining, ...addRows];

  merged.sort((a, b) => {
    if (a.txn_date !== b.txn_date) return a.txn_date < b.txn_date ? -1 : 1;
    const aOs = a.txn_type === 'OPEN_STOCK' ? 0 : 1;
    const bOs = b.txn_type === 'OPEN_STOCK' ? 0 : 1;
    if (aOs !== bOs) return aOs - bOs;
    return (a.created_at || '') < (b.created_at || '') ? -1 : 1;
  });

  const rows = [];
  let running = anchorBalance;
  for (const row of merged) {
    const inc = ['OPEN_STOCK','IN_FACTORY','TRANSFER_IN','ADJUSTMENT_IN'].includes(row.txn_type) ? Number(row.qty) : -Number(row.qty);
    running += inc;
    rows.push({
      txn_id: row.txn_id,
      txn_date: row.txn_date,
      txn_type: row.txn_type,
      qty: Number(row.qty),
      contribution: inc,
      simulatedBalance: running,
      wouldFail: running < 0 && !product.allow_negative_stock,
    });
  }

  return { anchorBalance, rows, godownId };
};

export const getVoidTransactionImpact = async (txn) => {
  if (txn.pair_id) {
    const { data: pair } = await supabase
      .from('transactions')
      .select('*')
      .eq('pair_id', txn.pair_id)
      .eq('is_void', false);
    const allLegs = pair || [];
    const outLeg = allLegs.find(l => l.txn_type === 'TRANSFER_OUT') || txn;
    const inLeg = allLegs.find(l => l.txn_type === 'TRANSFER_IN') || txn;
    const [src, dst] = await Promise.all([
      getAffectedTransactionsImpact(outLeg.product_id, outLeg.godown_id, outLeg.txn_date, { removeTxnIds: [outLeg.txn_id], addRows: [] }),
      getAffectedTransactionsImpact(inLeg.product_id, inLeg.godown_id, inLeg.txn_date, { removeTxnIds: [inLeg.txn_id], addRows: [] }),
    ]);
    return [src, dst];
  }
  return [
    await getAffectedTransactionsImpact(txn.product_id, txn.godown_id, txn.txn_date, { removeTxnIds: [txn.txn_id], addRows: [] })
  ];
};

export const editTransaction = async (txnId, updates, created_by) => {
  const { data: original, error: fetchErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('txn_id', txnId)
    .single();
  if (fetchErr) throw new Error('Transaction not found.');
  if (original.is_void) throw new Error('This transaction has already been voided and cannot be modified.');

  const qty = Number(updates.qty);
  if (!qty || qty <= 0) throw new Error('Quantity must be greater than zero.');
  if (!Number.isInteger(qty)) throw new Error('Quantity must be a whole number.');

  const txnDate = updates.txn_date || original.txn_date;
  if (new Date(txnDate) > new Date(new Date().toDateString())) throw new Error('Transaction date cannot be in the future.');
  if (updates.product_id && updates.product_id !== original.product_id) throw new Error('Product cannot be changed. Void this transaction and create a new one.');

  const godownId = updates.godown_id || original.godown_id;
  if (godownId !== original.godown_id) {
    const { data: g } = await supabase.from('godowns').select('is_active').eq('godown_id', godownId).single();
    if (!g?.is_active) throw new Error('Selected godown is inactive.');
  }

  const fromDate = txnDate < original.txn_date ? txnDate : original.txn_date;
  const now = new Date().toISOString();
  const newRow = {
    txn_id: 'new-correction',
    product_id: original.product_id,
    godown_id: godownId,
    txn_date: txnDate,
    txn_type: original.txn_type,
    qty,
    created_at: now,
  };

  if (godownId !== original.godown_id) {
    const oldRes = await runFSG(original.product_id, original.godown_id, original.txn_date, { removeTxnIds: [txnId], addRows: [] });
    if (!oldRes.passed) throw new Error(oldRes.message);
    const newRes = await runFSG(original.product_id, godownId, txnDate, { removeTxnIds: [], addRows: [newRow] });
    if (!newRes.passed) throw new Error(newRes.message);
  } else {
    const res = await runFSG(original.product_id, godownId, fromDate, { removeTxnIds: [txnId], addRows: [newRow] });
    if (!res.passed) throw new Error(res.message);
  }

  const voidReason = updates.void_reason || 'Edited via correction';
  const back_dated = new Date(txnDate) < new Date(new Date().toDateString());

  const { error: voidErr } = await supabase
    .from('transactions')
    .update({ is_void: true, void_reason: voidReason })
    .eq('txn_id', txnId);
  if (voidErr) throw voidErr;

  const { data: newTxn, error: insertErr } = await supabase
    .from('transactions')
    .insert([{
      product_id: original.product_id,
      godown_id: godownId,
      txn_date: txnDate,
      txn_type: original.txn_type,
      qty,
      is_void: false,
      ref_txn_id: txnId,
      created_by,
      back_dated,
    }])
    .select()
    .single();
  if (insertErr) throw insertErr;

  return newTxn;
};

export const editTransfer = async (pairId, updates, created_by) => {
  const { data: legs, error: fetchErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('pair_id', pairId)
    .eq('is_void', false);
  if (fetchErr) throw fetchErr;
  if (!legs || legs.length !== 2) throw new Error('Transfer pair not found.');

  const outLeg = legs.find(l => l.txn_type === 'TRANSFER_OUT');
  const inLeg = legs.find(l => l.txn_type === 'TRANSFER_IN');
  if (!outLeg || !inLeg) throw new Error('Invalid transfer pair.');

  const qty = Number(updates.qty);
  if (!qty || qty <= 0) throw new Error('Quantity must be greater than zero.');
  if (!Number.isInteger(qty)) throw new Error('Quantity must be a whole number.');

  const txnDate = updates.txn_date || outLeg.txn_date;
  if (new Date(txnDate) > new Date(new Date().toDateString())) throw new Error('Transaction date cannot be in the future.');
  if (updates.product_id && updates.product_id !== outLeg.product_id) throw new Error('Product cannot be changed.');

  const fromGodownId = updates.from_godown_id || outLeg.godown_id;
  const toGodownId = updates.to_godown_id || inLeg.godown_id;
  if (fromGodownId === toGodownId) throw new Error('Source and destination must be different.');

  if (fromGodownId !== outLeg.godown_id) {
    const { data: g } = await supabase.from('godowns').select('is_active').eq('godown_id', fromGodownId).single();
    if (!g?.is_active) throw new Error('Source godown is inactive.');
  }
  if (toGodownId !== inLeg.godown_id) {
    const { data: g } = await supabase.from('godowns').select('is_active').eq('godown_id', toGodownId).single();
    if (!g?.is_active) throw new Error('Destination godown is inactive.');
  }

  const fromDate = txnDate < outLeg.txn_date ? txnDate : outLeg.txn_date;
  const now = new Date().toISOString();

  const newOut = {
    txn_id: 'new-out',
    product_id: outLeg.product_id,
    godown_id: fromGodownId,
    txn_date: txnDate,
    txn_type: 'TRANSFER_OUT',
    qty,
    created_at: now,
  };
  const newIn = {
    txn_id: 'new-in',
    product_id: inLeg.product_id,
    godown_id: toGodownId,
    txn_date: txnDate,
    txn_type: 'TRANSFER_IN',
    qty,
    created_at: now,
  };

  if (fromGodownId !== outLeg.godown_id) {
    const oldSrc = await runFSG(outLeg.product_id, outLeg.godown_id, outLeg.txn_date, { removeTxnIds: [outLeg.txn_id], addRows: [] });
    if (!oldSrc.passed) throw new Error(oldSrc.message);
    const newSrc = await runFSG(outLeg.product_id, fromGodownId, txnDate, { removeTxnIds: [], addRows: [newOut] });
    if (!newSrc.passed) throw new Error(newSrc.message);
  } else {
    const src = await runFSG(outLeg.product_id, fromGodownId, fromDate, { removeTxnIds: [outLeg.txn_id], addRows: [newOut] });
    if (!src.passed) throw new Error(src.message);
  }

  if (toGodownId !== inLeg.godown_id) {
    const oldDst = await runFSG(inLeg.product_id, inLeg.godown_id, inLeg.txn_date, { removeTxnIds: [inLeg.txn_id], addRows: [] });
    if (!oldDst.passed) throw new Error(oldDst.message);
    const newDst = await runFSG(inLeg.product_id, toGodownId, txnDate, { removeTxnIds: [], addRows: [newIn] });
    if (!newDst.passed) throw new Error(newDst.message);
  } else {
    const dst = await runFSG(inLeg.product_id, toGodownId, fromDate, { removeTxnIds: [inLeg.txn_id], addRows: [newIn] });
    if (!dst.passed) throw new Error(dst.message);
  }

  const voidReason = updates.void_reason || 'Transfer edited via correction';
  const back_dated = new Date(txnDate) < new Date(new Date().toDateString());
  const newPairId = crypto.randomUUID();

  const { error: voidErr } = await supabase
    .from('transactions')
    .update({ is_void: true, void_reason: voidReason })
    .in('txn_id', [outLeg.txn_id, inLeg.txn_id]);
  if (voidErr) throw voidErr;

  const { data: newTxns, error: insertErr } = await supabase
    .from('transactions')
    .insert([
      {
        product_id: outLeg.product_id,
        godown_id: fromGodownId,
        txn_date: txnDate,
        txn_type: 'TRANSFER_OUT',
        qty,
        is_void: false,
        pair_id: newPairId,
        ref_txn_id: outLeg.txn_id,
        created_by,
        back_dated,
      },
      {
        product_id: inLeg.product_id,
        godown_id: toGodownId,
        txn_date: txnDate,
        txn_type: 'TRANSFER_IN',
        qty,
        is_void: false,
        pair_id: newPairId,
        ref_txn_id: inLeg.txn_id,
        created_by,
        back_dated,
      },
    ])
    .select();
  if (insertErr) throw insertErr;

  return newTxns;
};

export const voidTransaction = async (txnId, reason, created_by) => {
  if (!reason || !reason.trim()) throw new Error('A reason is required to void a transaction.');

  const { data: original, error: fetchErr } = await supabase
    .from('transactions')
    .select('*')
    .eq('txn_id', txnId)
    .single();
  if (fetchErr) throw new Error('Transaction not found.');
  if (original.is_void) throw new Error('This transaction has already been voided.');

  if (original.pair_id) {
    const { data: pair } = await supabase
      .from('transactions')
      .select('*')
      .eq('pair_id', original.pair_id)
      .eq('is_void', false);

    const allLegs = pair || [];
    const outLeg = allLegs.find(l => l.txn_type === 'TRANSFER_OUT') || original;
    const inLeg = allLegs.find(l => l.txn_type === 'TRANSFER_IN') || original;
    const bothIds = [...new Set([outLeg.txn_id, inLeg.txn_id])];

    const srcResult = await runFSG(outLeg.product_id, outLeg.godown_id, outLeg.txn_date, { removeTxnIds: [outLeg.txn_id], addRows: [] });
    if (!srcResult.passed) throw new Error(srcResult.message);

    const dstResult = await runFSG(inLeg.product_id, inLeg.godown_id, inLeg.txn_date, { removeTxnIds: [inLeg.txn_id], addRows: [] });
    if (!dstResult.passed) throw new Error(dstResult.message);

    const { error: voidErr } = await supabase
      .from('transactions')
      .update({ is_void: true, void_reason: reason.trim() })
      .in('txn_id', bothIds);
    if (voidErr) throw voidErr;

    return { voided: bothIds };
  }

  const result = await runFSG(original.product_id, original.godown_id, original.txn_date, { removeTxnIds: [txnId], addRows: [] });
  if (!result.passed) throw new Error(result.message);

  const { error: voidErr } = await supabase
    .from('transactions')
    .update({ is_void: true, void_reason: reason.trim() })
    .eq('txn_id', txnId);
  if (voidErr) throw voidErr;

  return { voided: [txnId] };
};

export const getAllTransactions = async ({ product_id, godown_id, txn_type, from_date, to_date } = {}) => {
  let query = supabase
    .from('transactions')
    .select(`
      *,
      products ( name, unit ),
      godowns ( name )
    `)
    .eq('is_void', false)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (product_id && product_id !== 'all') query = query.eq('product_id', product_id);
  if (godown_id && godown_id !== 'all') query = query.eq('godown_id', godown_id);
  if (txn_type && txn_type !== 'all') query = query.eq('txn_type', txn_type);
  if (from_date) query = query.gte('txn_date', from_date);
  if (to_date) query = query.lte('txn_date', to_date);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};
