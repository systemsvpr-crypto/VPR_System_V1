import { supabase, fetchAllRows } from '../supabase';
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

// godown_stock holds one row per (product, godown) pair, so its row count is
// products × godowns — with a few hundred products across a handful of
// godowns this crosses Supabase's 1000-row-per-request cap easily, so it
// must page past it rather than fetch a single unbounded request.
export const getAllProductStock = async () => {
  return fetchAllRows(() => supabase
    .from('godown_stock')
    .select('*'));
};

export const getAllProducts = async () => {
  try {
    const [products, groupsRes] = await Promise.all([
      fetchAllRows(() => supabase.from('products').select('*').order('name', { ascending: true })),
      supabase.from('product_groups').select('group_id, group_name, rank_rates')
    ]);
    const groupsMap = new Map();
    (groupsRes?.data || []).forEach(g => {
      if (g.group_id) groupsMap.set(g.group_id, g);
    });
    return products.map(p => ({
      ...p,
      product_groups: p.group_id ? groupsMap.get(p.group_id) || null : null,
    }));
  } catch (err) {
    console.warn('Fallback loading products without groups:', err);
    return fetchAllRows(() => supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true }));
  }
};

// The 4 fields that define a unique product: same Brand Name + Category + Product Type + Mux
// is always treated as the same product, regardless of Unit or spelling/case/whitespace differences.
const productMatchKey = (brandName, category, productType, mux) =>
  [brandName, category, productType, mux].map(v => (v || '').trim().toLowerCase()).join('|');

const getAllProductKeys = async () => {
  return fetchAllRows(() => supabase
    .from('products')
    .select('product_id, name, brand_name, category, product_type, mux, group_id, created_at'));
};

// Just the Brand Name + Category half of productMatchKey — what actually
// decides which product_groups row a product belongs to (Product Type/Mux
// don't factor into grouping).
const groupKey = (brandName, category) =>
  [brandName, category].map(v => (v || '').trim().toLowerCase()).join('|');

// Brand Name / Category, spelling-locked to whichever casing was stored
// first: if any existing product already has this value (case-insensitively
// — "Aa" matches an existing "AA"), reuse that exact casing instead of
// letting a new product introduce its own spelling variant of the same
// brand/category. `field` is 'brand_name' or 'category'; `excludeId` leaves
// out the product currently being edited, so fixing that product's own
// casing (e.g. a typo) isn't immediately reverted by matching its own
// pre-edit value.
const resolveExistingCasing = (value, field, allProducts, excludeId) => {
  const trimmed = (value || '').trim();
  if (!trimmed) return trimmed;
  const matches = allProducts
    .filter(p => p.product_id !== excludeId && (p[field] || '').trim().toLowerCase() === trimmed.toLowerCase())
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return matches.length > 0 ? matches[0][field].trim() : trimmed;
};

const duplicateProductError = (name) => {
  const err = new Error(`Already in database: "${name}" has the same Brand Name, Category, Product Type & Mux.`);
  err.code = 'DUPLICATE_PRODUCT';
  return err;
};

// Every product belongs to a product_groups row keyed by its own Brand Name +
// Category, concatenated exactly as typed (Brand "AA" + Category "BB" ->
// group_name "AABB") — reused case-insensitively, so "Aa"+"BB" resolves to
// that same "AABB" row instead of creating a near-duplicate group. Returns
// null when both fields are blank (nothing to group by).
const PG_UNIQUE_VIOLATION = '23505';

const resolveProductGroupId = async (brand_name, category, created_by) => {
  const groupName = `${(brand_name || '').trim()}${(category || '').trim()}`;
  if (!groupName) return null;

  const { data: groups, error: fetchErr } = await supabase
    .from('product_groups')
    .select('group_id, group_name');
  if (fetchErr) throw fetchErr;

  const existing = (groups || []).find(g => (g.group_name || '').trim().toLowerCase() === groupName.toLowerCase());
  if (existing) return existing.group_id;

  const { data: created, error: createErr } = await supabase
    .from('product_groups')
    .insert([{ group_name: groupName, created_by: created_by || null }])
    .select('group_id')
    .single();
  if (createErr) {
    // Another request created the exact same group in the gap between our
    // lookup and insert — fall back to using theirs instead of failing.
    if (createErr.code === PG_UNIQUE_VIOLATION) {
      const { data: retryGroups } = await supabase.from('product_groups').select('group_id, group_name');
      const retryMatch = (retryGroups || []).find(g => (g.group_name || '').trim().toLowerCase() === groupName.toLowerCase());
      if (retryMatch) return retryMatch.group_id;
    }
    throw createErr;
  }
  return created.group_id;
};

export const createProduct = async ({ name, unit, allow_negative_stock, product_type, brand_name, category, mux, openingEntries, as_of_date, created_by, group_id }) => {
  const allProducts = await getAllProductKeys();

  // Lock Brand Name / Category to whichever casing is already on record
  // (case-insensitively) — "Aa" after "AA" already exists keeps storing
  // "AA", here and in the auto-generated Product Name below, instead of
  // adding "Aa" as a second spelling of the same brand/category.
  const normalizedBrand = resolveExistingCasing(brand_name, 'brand_name', allProducts);
  const normalizedCategory = resolveExistingCasing(category, 'category', allProducts);

  const newKey = productMatchKey(normalizedBrand, normalizedCategory, product_type, mux);
  const duplicate = allProducts.find(p => productMatchKey(p.brand_name, p.category, p.product_type, p.mux) === newKey);
  if (duplicate) {
    throw duplicateProductError(duplicate.name);
  }

  const finalGroupId = group_id || await resolveProductGroupId(normalizedBrand, normalizedCategory, created_by);
  // Re-derived from the normalized Brand/Category rather than trusting the
  // popup's own live preview verbatim — that preview is built from whatever
  // was actually typed, which may not be the casing that ends up stored.
  const resolvedName = bulkImportProductName(normalizedBrand, normalizedCategory, product_type, mux) || name;

  const { data: product, error: productError } = await supabase
    .from('products')
    .insert([{ name: resolvedName, unit, allow_negative_stock: !!allow_negative_stock, product_type: product_type || '', brand_name: normalizedBrand, category: normalizedCategory, mux: mux || '', group_id: finalGroupId }])
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

export const updateProduct = async ({ product_id, name, unit, allow_negative_stock, product_type, brand_name, category, mux, group_id }) => {
  const allProducts = await getAllProductKeys();
  const self = allProducts.find(p => p.product_id === product_id);

  // Lock Brand Name / Category to whichever casing is already on record
  // elsewhere (case-insensitively) — this product's own current (pre-edit)
  // value is excluded from that check, so deliberately fixing this
  // product's own casing (e.g. a typo) isn't immediately reverted by
  // matching itself.
  const normalizedBrand = resolveExistingCasing(brand_name, 'brand_name', allProducts, product_id);
  const normalizedCategory = resolveExistingCasing(category, 'category', allProducts, product_id);

  const newKey = productMatchKey(normalizedBrand, normalizedCategory, product_type, mux);
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

  // Re-resolve the group only when Brand/Category themselves actually change
  // (Product Type/Mux edits don't affect grouping) — so an edit that renames
  // either one moves the product into the right group instead of leaving it
  // linked to its old one, without spending an extra lookup on every save.
  const oldGroupKey = self ? groupKey(self.brand_name, self.category) : null;
  const finalGroupId = group_id
    ? group_id
    : (groupKey(normalizedBrand, normalizedCategory) !== oldGroupKey || !self?.group_id
        ? await resolveProductGroupId(normalizedBrand, normalizedCategory)
        : self?.group_id ?? await resolveProductGroupId(normalizedBrand, normalizedCategory));
  const resolvedName = bulkImportProductName(normalizedBrand, normalizedCategory, product_type, mux) || name;

  const { data, error } = await supabase
    .from('products')
    .update({ name: resolvedName, unit, allow_negative_stock, product_type: product_type || '', brand_name: normalizedBrand, category: normalizedCategory, mux: mux || '', group_id: finalGroupId })
    .eq('product_id', product_id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Removes a product_groups row once nothing references it any more: no
// product is still auto-linked via group_id, AND it has no manual
// membership via product_group_members either — that join table backs the
// separate, manually-curated "Product Grouping" tab, so a group someone set
// up there is never deleted out from under them just because its
// auto-linked products happened to all get deleted.
const deleteGroupIfOrphaned = async (group_id) => {
  const [{ count: productCount, error: productErr }, { count: memberCount, error: memberErr }] = await Promise.all([
    supabase.from('products').select('product_id', { count: 'exact', head: true }).eq('group_id', group_id),
    supabase.from('product_group_members').select('id', { count: 'exact', head: true }).eq('group_id', group_id),
  ]);
  if (productErr) throw productErr;
  if (memberErr) throw memberErr;
  if ((productCount || 0) === 0 && (memberCount || 0) === 0) {
    await supabase.from('product_groups').delete().eq('group_id', group_id);
  }
};

export const deleteProduct = async (product_id) => {
  const { data: product } = await supabase
    .from('products')
    .select('group_id')
    .eq('product_id', product_id)
    .maybeSingle();

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('product_id', product_id);
  if (error) throw error;

  // Last product of its group just went — clean up the now-empty group too,
  // so product_groups doesn't accumulate rows nothing points to any more.
  // The product itself is already gone at this point either way, so a
  // failure here is logged rather than thrown — it shouldn't surface as
  // "delete failed" for a deletion that actually succeeded.
  if (product?.group_id) {
    try {
      await deleteGroupIfOrphaned(product.group_id);
    } catch (err) {
      console.error('Failed to clean up orphaned product group:', err.message);
    }
  }
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

  const transactions = await fetchAllRows(() => supabase
    .from('transactions')
    .select('product_id, godown_id, qty, txn_type')
    .eq('is_void', false)
    .lte('txn_date', date));

  const balanceMap = {};
  for (const txn of transactions || []) {
    const key = `${txn.product_id}|${txn.godown_id}`;
    if (['OPEN_STOCK', 'IN_FACTORY', 'PRODUCTION_IN', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PURCHASE_IN', 'PURCHASE_IN(TPT)'].includes(txn.txn_type)) {
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

  const allProducts = await fetchAllRows(() => supabase
    .from('products')
    .select('product_id, name, brand_name, category, product_type, unit, mux'));

  const productMap = {};
  for (const p of allProducts || []) {
    productMap[productMatchKey(p.brand_name, p.category, p.product_type, p.mux)] = p.product_id;
  }

  const uniqueProducts = [];
  const seen = new Set();
  for (const r of rows) {
    if (r.productId && !r.isNew) continue;
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
          allow_negative_stock: false,
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
    const displayName = row.productName || bulkImportProductName(row.brandName, row.category, row.productType, row.mux);
    const productKey = productMatchKey(row.brandName, row.category, row.productType, row.mux);
    const godownKey = row.godownName?.trim().toLowerCase();
    const qty = Number(row.qty);

    if (!row.productId && !row.brandName?.trim() && !row.category?.trim()) {
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

    const productId = (row.productId && !row.isNew) ? row.productId : productMap[productKey];
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

// Opening stock import for products/godowns that already exist — unlike
// bulkImportProducts, this never creates a product: product_id/godown_id are
// resolved client-side (by matching the file's Product Name / Godown text
// against the current lists) and rows arrive here already carrying them, or
// blank when nothing matched. Writes the same OPEN_STOCK transaction shape
// bulkImportProducts/createProduct do, so opening balances land identically
// regardless of which import path set them.
export const bulkImportOpeningStock = async ({ rows, as_of_date, created_by }) => {
  const errors = [];
  const openingEntries = [];
  const today = new Date();
  const todayStr = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = row.rawProductName || `Row ${i + 1}`;
    const qty = Number(row.qty);

    if (!row.product_id) {
      errors.push({ row: label, message: `Product "${row.rawProductName || ''}" could not be matched` });
      continue;
    }
    if (!row.godown_id) {
      errors.push({ row: `${label} → ${row.rawGodownName || ''}`, message: `Godown "${row.rawGodownName || ''}" could not be matched` });
      continue;
    }
    if (isNaN(qty) || qty < 0 || !hasValidQtyPrecision(qty)) {
      errors.push({ row: `${label} → ${row.rawGodownName || ''}`, message: 'Quantity must be a valid non-negative number with at most two decimal places' });
      continue;
    }

    openingEntries.push({
      product_id: row.product_id,
      godown_id: row.godown_id,
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
    errors,
  };
};
