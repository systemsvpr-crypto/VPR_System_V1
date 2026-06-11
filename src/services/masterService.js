import { supabase } from '../supabase';

export const getAllGodowns = async () => {
  const { data, error } = await supabase
    .from('godowns')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createGodown = async (name) => {
  const { data, error } = await supabase
    .from('godowns')
    .insert([{ name, is_active: true }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const toggleGodownStatus = async (godownId, isActive) => {
  const { error } = await supabase
    .from('godowns')
    .update({ is_active: isActive })
    .eq('godown_id', godownId);
  if (error) throw error;
};

export const getAllProductStock = async () => {
  const { data, error } = await supabase
    .from('godown_stock')
    .select('*');
  if (error) throw error;
  return data || [];
};

export const getAllProducts = async () => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createProduct = async ({ name, unit, allow_negative_stock, product_type, openingEntries, as_of_date, created_by }) => {
  const { data: product, error: productError } = await supabase
    .from('products')
    .insert([{ name, unit, allow_negative_stock: true, product_type: product_type || '' }])
    .select()
    .single();
  if (productError) throw productError;

  if (openingEntries && openingEntries.length > 0) {
    const openingRows = openingEntries
      .filter(e => e.godown_id && Number(e.qty) > 0 && Number.isInteger(Number(e.qty)))
      .map(e => ({
        product_id: product.product_id,
        godown_id: e.godown_id,
        txn_date: as_of_date,
        txn_type: 'OPEN_STOCK',
        qty: Number(e.qty),
        is_void: false,
        created_by,
        back_dated: new Date(as_of_date) < new Date(new Date().toDateString()),
      }));

    if (openingRows.length > 0) {
      const { error: txnError } = await supabase
        .from('transactions')
        .insert(openingRows);
      if (txnError) throw txnError;
    }
  }

  return product;
};

export const updateProduct = async ({ product_id, name, unit, allow_negative_stock, product_type }) => {
  const { data, error } = await supabase
    .from('products')
    .update({ name, unit, allow_negative_stock, product_type: product_type || '' })
    .eq('product_id', product_id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getProductStockByDate = async (date) => {
  const { data: godowns } = await supabase
    .from('godowns')
    .select('*')
    .order('name', { ascending: true });

  const { data: transactions } = await supabase
    .from('transactions')
    .select('product_id, godown_id, qty, txn_type')
    .eq('is_void', false)
    .lte('txn_date', date);

  const balanceMap = {};
  for (const txn of transactions || []) {
    const key = `${txn.product_id}|${txn.godown_id}`;
    if (['OPEN_STOCK', 'IN_FACTORY', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(txn.txn_type)) {
      balanceMap[key] = (balanceMap[key] || 0) + Number(txn.qty);
    } else {
      balanceMap[key] = (balanceMap[key] || 0) - Number(txn.qty);
    }
  }

  return { godowns: godowns || [], balanceMap };
};

export const getProductOpeningStock = async (productId) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('product_id', productId)
    .eq('txn_type', 'OPEN_STOCK')
    .eq('is_void', false);
  if (error) throw error;
  return data || [];
};

export const bulkImportProducts = async ({ rows, as_of_date, created_by }) => {
  const { data: allGodowns, error: godownErr } = await supabase
    .from('godowns')
    .select('godown_id, name');
  if (godownErr) throw godownErr;

  const godownMap = {};
  for (const g of allGodowns || []) {
    godownMap[g.name.toLowerCase().trim()] = g.godown_id;
  }

  const { data: allProducts, error: prodErr } = await supabase
    .from('products')
    .select('product_id, name');
  if (prodErr) throw prodErr;

  const productMap = {};
  for (const p of allProducts || []) {
    productMap[p.name.toLowerCase().trim()] = p.product_id;
  }

  const uniqueProducts = [];
  const seen = new Set();
  for (const r of rows) {
    const name = r.productName?.trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      uniqueProducts.push({ name, product_type: r.productType?.trim() || '' });
    }
  }
  const errors = [];
  const newProducts = [];

  for (const { name, product_type } of uniqueProducts) {
    const key = name.toLowerCase();
    if (!productMap[key]) {
      const { data: created, error: createErr } = await supabase
        .from('products')
        .insert([{ name, unit: 'kg', allow_negative_stock: true, product_type }])
        .select()
        .single();
      if (createErr) {
        for (const row of rows.filter(r => r.productName.trim().toLowerCase() === key)) {
          errors.push({ row: `${row.productName} → ${row.godownName}`, message: `Failed to create product: ${createErr.message}` });
        }
      } else {
        productMap[key] = created.product_id;
        newProducts.push(created);
      }
    }
  }

  const openingEntries = [];
  const today = new Date();
  const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const productKey = row.productName?.trim().toLowerCase();
    const godownKey = row.godownName?.trim().toLowerCase();
    const qty = Number(row.qty);

    if (!productKey || !row.productName?.trim()) {
      errors.push({ row: `Row ${i + 1}`, message: 'Product name is empty' });
      continue;
    }
    if (!godownKey || !row.godownName?.trim()) {
      errors.push({ row: `Row ${i + 1}: ${row.productName}`, message: 'Godown name is empty' });
      continue;
    }
    if (isNaN(qty) || qty < 0 || !Number.isInteger(qty)) {
      errors.push({ row: `Row ${i + 1}: ${row.productName} → ${row.godownName}`, message: 'Quantity must be a valid non-negative whole number' });
      continue;
    }

    const productId = productMap[productKey];
    if (!productId) {
      errors.push({ row: `Row ${i + 1}: ${row.productName}`, message: 'Product could not be resolved' });
      continue;
    }

    const godownId = godownMap[godownKey];
    if (!godownId) {
      errors.push({ row: `Row ${i + 1}: ${row.productName} → ${row.godownName}`, message: `Godown "${row.godownName}" not found` });
      continue;
    }

    openingEntries.push({
      product_id: productId,
      godown_id: godownId,
      txn_date: as_of_date,
      txn_type: 'OPEN_STOCK',
      qty,
      is_void: false,
      created_by,
      back_dated: new Date(as_of_date) < new Date(todayStr),
    });
  }

  if (openingEntries.length > 0) {
    const { error: txnError } = await supabase
      .from('transactions')
      .insert(openingEntries);
    if (txnError) throw txnError;
  }

  return {
    successCount: openingEntries.length,
    errorCount: errors.length,
    newProductCount: newProducts.length,
    errors,
  };
};
