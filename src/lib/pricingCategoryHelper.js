/**
 * Helper to resolve customer category tier ('A', 'B', or 'C')
 * Supports ranks as an object on customer (customer.ranks) or lookup via rank_id in ranksList.
 * Matches names like "A", "Rank A", "Category A", "Tier A", "B", "C", etc.
 */
export const resolveCustomerTier = (customer, ranksList = []) => {
  if (!customer) return null;

  let raw = customer.ranks?.rank_name;
  if (!raw && customer.rank_id && Array.isArray(ranksList)) {
    const found = ranksList.find(r => r.rank_id === customer.rank_id);
    if (found) raw = found.rank_name;
  }

  if (!raw) return null;

  const str = String(raw).trim().toUpperCase();

  // Direct and common prefix/suffix matches
  if (str === 'A' || str.startsWith('A ') || str.endsWith(' A') || str.includes('RANK A') || str.includes('CATEGORY A') || str.includes('TIER A')) {
    return 'A';
  }
  if (str === 'B' || str.startsWith('B ') || str.endsWith(' B') || str.includes('RANK B') || str.includes('CATEGORY B') || str.includes('TIER B')) {
    return 'B';
  }
  if (str === 'C' || str.startsWith('C ') || str.endsWith(' C') || str.includes('RANK C') || str.includes('CATEGORY C') || str.includes('TIER C')) {
    return 'C';
  }

  // Regex word boundary match
  if (/\bA\b/.test(str)) return 'A';
  if (/\bB\b/.test(str)) return 'B';
  if (/\bC\b/.test(str)) return 'C';

  return null;
};

/**
 * Get the pricing rate for a product based on customer tier ('A', 'B', or 'C')
 * Looks into product.product_groups or provided group object.
 * Returns numeric rate or null if not configured.
 */
export const getProductRateForCustomer = (product, customer, ranksList = []) => {
  if (!product) return null;

  const tier = resolveCustomerTier(customer, ranksList);
  if (!tier) return null;

  const group = product.product_groups;
  if (!group) return null;

  if (tier === 'A' && group.a_rate !== null && group.a_rate !== undefined && group.a_rate !== '') {
    const val = Number(group.a_rate);
    return isNaN(val) ? null : val;
  }
  if (tier === 'B' && group.b_rate !== null && group.b_rate !== undefined && group.b_rate !== '') {
    const val = Number(group.b_rate);
    return isNaN(val) ? null : val;
  }
  if (tier === 'C' && group.c_rate !== null && group.c_rate !== undefined && group.c_rate !== '') {
    const val = Number(group.c_rate);
    return isNaN(val) ? null : val;
  }

  return null;
};
