/**
 * Helper to resolve customer category / rank tier ('A', 'B', 'C', 'D', 'E', 'A+', etc.)
 * Supports ranks as an object on customer (customer.ranks) or lookup via rank_id in ranksList.
 */
export const resolveCustomerTier = (customer, ranksList = []) => {
  if (!customer) return null;

  // 1. Direct rank name from customer.ranks relation or customer.rank_name
  let raw = customer.ranks?.rank_name || customer.rank_name;

  // 2. Lookup via customer.rank_id in ranksList
  if (!raw && customer.rank_id && Array.isArray(ranksList) && ranksList.length > 0) {
    const found = ranksList.find(r => String(r.rank_id) === String(customer.rank_id));
    if (found) raw = found.rank_name;
  }

  if (!raw) return null;

  return String(raw).trim();
};

/**
 * Get the pricing rate for a product based on customer rank (A, B, C, D, etc.)
 * Looks into product.product_groups or provided groupList.
 * Returns numeric rate or null if not configured.
 */
export const getProductRateForCustomer = (product, customer, ranksList = [], groupList = []) => {
  if (!product || !customer) return null;

  const tier = resolveCustomerTier(customer, ranksList);
  if (!tier) return null;

  // Resolve product group either directly from product or via groupList
  let group = product.product_groups;
  if (!group && product.group_id && Array.isArray(groupList) && groupList.length > 0) {
    group = groupList.find(g => String(g.group_id) === String(product.group_id));
  }
  if (!group) return null;

  // Check dynamic rank_rates JSONB first
  if (group.rank_rates && typeof group.rank_rates === 'object') {
    const rates = group.rank_rates;

    // 1. Direct match (e.g. "B", "A", "D", "A+")
    if (rates[tier] !== undefined && rates[tier] !== null && rates[tier] !== '') {
      const val = Number(rates[tier]);
      if (!isNaN(val)) return val;
    }

    // 2. Case-insensitive key match
    const foundKey = Object.keys(rates).find(
      k => k.trim().toUpperCase() === tier.toUpperCase()
    );
    if (foundKey && rates[foundKey] !== undefined && rates[foundKey] !== null && rates[foundKey] !== '') {
      const val = Number(rates[foundKey]);
      if (!isNaN(val)) return val;
    }

    // 3. Clean up prefix if rank is like "Rank B" or "Category B" -> "B"
    const cleaned = tier.replace(/^(RANK|TIER|CATEGORY)\s+/i, '').trim();
    if (rates[cleaned] !== undefined && rates[cleaned] !== null && rates[cleaned] !== '') {
      const val = Number(rates[cleaned]);
      if (!isNaN(val)) return val;
    }

    // 4. Base letter fallback (e.g. "A+" -> "A")
    const baseLetter = tier.charAt(0).toUpperCase();
    if (rates[baseLetter] !== undefined && rates[baseLetter] !== null && rates[baseLetter] !== '') {
      const val = Number(rates[baseLetter]);
      if (!isNaN(val)) return val;
    }
  }

  // Legacy fallback for old fixed columns (a_rate, b_rate, c_rate)
  const upper = tier.toUpperCase();
  if ((upper === 'A' || upper.startsWith('A')) && group.a_rate != null && group.a_rate !== '') {
    const val = Number(group.a_rate);
    if (!isNaN(val)) return val;
  }
  if ((upper === 'B' || upper.startsWith('B')) && group.b_rate != null && group.b_rate !== '') {
    const val = Number(group.b_rate);
    if (!isNaN(val)) return val;
  }
  if ((upper === 'C' || upper.startsWith('C')) && group.c_rate != null && group.c_rate !== '') {
    const val = Number(group.c_rate);
    if (!isNaN(val)) return val;
  }

  return null;
};

