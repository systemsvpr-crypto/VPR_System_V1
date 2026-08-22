import { supabase } from '../supabase';
import { hasValidQtyPrecision } from '../lib/qty';

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

// The 4 fields that define a unique product: same Brand Name + Category + Product Type + Mux
// is always treated as the same product, regardless of Unit or spelling/case/whitespace differences.
const productMatchKey = (brandName, category, productType, mux) =>
  [brandName, category, productType, mux].map(v => (v || '').trim().toLowerCase()).join('|');

const getAllProductKeys = async () => {
  const { data, error } = await supabase
    .from('products')
    .select('product_id, name, brand_name, category, product_type, mux');
  if (error) throw error;
  return data || [];
};

const duplicateProductError = (name) => {
  const err = new Error(`Already in database: "${name}" has the same Brand Name, Category, Product Type & Mux.`);
  err.code = 'DUPLICATE_PRODUCT';
  return err;
};

export const createProduct = async ({ name, unit, allow_negative_stock, product_type, brand_name, category, mux, openingEntries, as_of_date, created_by }) => {
  const newKey = productMatchKey(brand_name, category, product_type, mux);
  const allProducts = await getAllProductKeys();
  const duplicate = allProducts.find(p => productMatchKey(p.brand_name, p.category, p.product_type, p.mux) === newKey);
  if (duplicate) {
    throw duplicateProductError(duplicate.name);
  }

  const { data: product, error: productError } = await supabase
    .from('products')
    .insert([{ name, unit, allow_negative_stock: true, product_type: product_type || '', brand_name: brand_name || '', category: category || '', mux: mux || '' }])
    .select()
    .single();
  if (productError) throw productError;

  if (openingEntries && openingEntries.length > 0) {
    const openingRows = openingEntries
      .filter(e => e.godown_id && Number(e.qty) > 0 && hasValidQtyPrecision(Number(e.qty)))
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

export const updateProduct = async ({ product_id, name, unit, allow_negative_stock, product_type, brand_name, category, mux }) => {
  const newKey = productMatchKey(brand_name, category, product_type, mux);
  const allProducts = await getAllProductKeys();
  const self = allProducts.find(p => p.product_id === product_id);
  const oldKey = self ? productMatchKey(self.brand_name, self.category, self.product_type, self.mux) : null;

  // Only block when this edit actually changes the identity fields into a collision with
  // another product — a pre-existing duplicate elsewhere shouldn't lock out unrelated edits
  // (e.g. fixing Unit) on a product whose own Brand/Category/Type/Mux hasn't changed.
  if (newKey !== oldKey) {
    const duplicate = allProducts.find(p => p.product_id !== product_id && productMatchKey(p.brand_name, p.category, p.product_type, p.mux) === newKey);
    if (duplicate) {
      throw duplicateProductError(duplicate.name);
    }
  }

  const { data, error } = await supabase
    .from('products')
    .update({ name, unit, allow_negative_stock, product_type: product_type || '', brand_name: brand_name || '', category: category || '', mux: mux || '' })
    .eq('product_id', product_id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteProduct = async (product_id) => {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('product_id', product_id);
  if (error) throw error;
};

export const deleteGodown = async (godown_id) => {
  const { error } = await supabase
    .from('godowns')
    .delete()
    .eq('godown_id', godown_id);
  if (error) throw error;
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
    if (['OPEN_STOCK', 'IN_FACTORY', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PURCHASE_IN', 'PURCHASE_IN(TPT)'].includes(txn.txn_type)) {
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

const bulkImportProductName = (brandName, category, productType, mux) => {
  const base = [brandName, category, productType].map(v => (v || '').trim()).filter(Boolean).join(' ');
  return mux?.trim() ? `${base} (${mux.trim()})` : base;
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
    .select('product_id, name, brand_name, category, product_type, unit, mux');
  if (prodErr) throw prodErr;

  const productMap = {};
  for (const p of allProducts || []) {
    productMap[productMatchKey(p.brand_name, p.category, p.product_type, p.mux)] = p.product_id;
  }

  const uniqueProducts = [];
  const seen = new Set();
  for (const r of rows) {
    const key = productMatchKey(r.brandName, r.category, r.productType, r.mux);
    if ((r.brandName?.trim() || r.category?.trim()) && !seen.has(key)) {
      seen.add(key);
      uniqueProducts.push({ key, ...r });
    }
  }
  const errors = [];
  const newProducts = [];

  for (const row of uniqueProducts) {
    if (!productMap[row.key]) {
      const name = bulkImportProductName(row.brandName, row.category, row.productType, row.mux);
      const { data: created, error: createErr } = await supabase
        .from('products')
        .insert([{
          name,
          unit: row.unit?.trim() || 'pcs',
          allow_negative_stock: true,
          product_type: row.productType?.trim() || '',
          brand_name: row.brandName?.trim() || '',
          category: row.category?.trim() || '',
          mux: row.mux?.trim() || '',
        }])
        .select()
        .single();
      if (createErr) {
        for (const r of rows.filter(r => productMatchKey(r.brandName, r.category, r.productType, r.mux) === row.key)) {
          errors.push({ row: `${name} → ${r.godownName}`, message: `Failed to create product: ${createErr.message}` });
        }
      } else {
        productMap[row.key] = created.product_id;
        newProducts.push(created);
      }
    }
  }

  const openingEntries = [];
  const today = new Date();
  const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const displayName = bulkImportProductName(row.brandName, row.category, row.productType, row.mux);
    const productKey = productMatchKey(row.brandName, row.category, row.productType, row.mux);
    const godownKey = row.godownName?.trim().toLowerCase();
    const qty = Number(row.qty);

    if (!row.brandName?.trim() && !row.category?.trim()) {
      errors.push({ row: `Row ${i + 1}`, message: 'Brand Name / Category is empty' });
      continue;
    }
    if (!godownKey) {
      errors.push({ row: `Row ${i + 1}: ${displayName}`, message: 'Godown name is empty' });
      continue;
    }
    if (isNaN(qty) || qty < 0 || !hasValidQtyPrecision(qty)) {
      errors.push({ row: `Row ${i + 1}: ${displayName} → ${row.godownName}`, message: 'Quantity must be a valid non-negative number with at most two decimal places' });
      continue;
    }

    const productId = productMap[productKey];
    if (!productId) {
      errors.push({ row: `Row ${i + 1}: ${displayName}`, message: 'Product could not be resolved' });
      continue;
    }

    const godownId = godownMap[godownKey];
    if (!godownId) {
      errors.push({ row: `Row ${i + 1}: ${displayName} → ${row.godownName}`, message: `Godown "${row.godownName}" not found` });
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
