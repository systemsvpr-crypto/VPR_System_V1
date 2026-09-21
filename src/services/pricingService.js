import { supabase } from '../supabase';

/**
 * Fetch all product groups with pricing information
 */
export const getAllPricingGroups = async () => {
  try {
    const [groupsRes, indentItemsRes, historyRes] = await Promise.all([
      supabase
        .from('product_groups')
        .select(`
          group_id,
          group_name,
          created_at,
          created_by,
          second_last_purchase,
          last_purchase,
          a_rate,
          b_rate,
          c_rate,
          created_by_user:created_by(user_id, full_name, username)
        `)
        .order('group_name', { ascending: true }),
      supabase
        .from('purchase_indent_items')
        .select(`
          group_id,
          rate,
          approved_rate,
          created_at,
          purchase_indents!inner (
            indent_id,
            indent_date,
            is_void,
            group_id
          )
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('product_group_history')
        .select('group_id, created_at, updated_at')
        .order('created_at', { ascending: false })
    ]);

    let groups = groupsRes?.data;
    if (groupsRes?.error) {
      // Fallback without join in case users relation is restricted
      const fallback = await supabase
        .from('product_groups')
        .select('*')
        .order('group_name', { ascending: true });
      if (fallback.error) throw fallback.error;
      groups = fallback.data || [];
    }

    const items = indentItemsRes?.data || [];
    const historyList = historyRes?.data || [];

    // Map history to get the latest ABC update timestamp per group
    const groupHistoryMap = new Map();
    for (const h of historyList) {
      if (!h.group_id) continue;
      if (!groupHistoryMap.has(h.group_id)) {
        groupHistoryMap.set(h.group_id, h.updated_at || h.created_at);
      }
    }

    // Helper to get effective rate from an indent item
    const getEffectiveRate = (it) => {
      if (!it) return null;
      const appRate = Number(it.approved_rate);
      if (appRate > 0) return appRate;
      const r = Number(it.rate);
      return r > 0 ? r : null;
    };

    // Map valid items by group_id
    const groupItemsMap = new Map();
    for (const item of items) {
      if (item.purchase_indents?.is_void) continue;
      const effectiveRate = getEffectiveRate(item);
      if (!effectiveRate) continue;

      const gid = item.group_id || item.purchase_indents?.group_id;
      if (!gid) continue;
      if (!groupItemsMap.has(gid)) {
        groupItemsMap.set(gid, []);
      }
      groupItemsMap.get(gid).push(item);
    }

    // Process each group to compute rates and timestamps
    return (groups || []).map((g) => {
      const groupItems = groupItemsMap.get(g.group_id) || [];

      // Sort by indent_date desc, created_at desc
      groupItems.sort((a, b) => {
        const dateA = a.purchase_indents?.indent_date || '';
        const dateB = b.purchase_indents?.indent_date || '';
        const dateComp = dateB.localeCompare(dateA);
        if (dateComp !== 0) return dateComp;
        const timeA = a.created_at || '';
        const timeB = b.created_at || '';
        return timeB.localeCompare(timeA);
      });

      // Filter distinct purchase indents
      const distinctPurchases = [];
      const seenIndentIds = new Set();
      for (const it of groupItems) {
        const indentId = it.purchase_indents?.indent_id;
        if (indentId && !seenIndentIds.has(indentId)) {
          seenIndentIds.add(indentId);
          distinctPurchases.push(it);
        }
      }

      // Latest purchase from pipeline is Current Purchase, preceding is Last Purchase
      const currentPurchase = distinctPurchases[0] || null;
      const lastPurchase = distinctPurchases[1] || null;

      const currentPurchaseRate = getEffectiveRate(currentPurchase);
      const lastPurchaseRate = getEffectiveRate(lastPurchase);
      const currentPurchaseDate = currentPurchase?.purchase_indents?.indent_date || null;
      const lastPurchaseDate = lastPurchase?.purchase_indents?.indent_date || g.last_purchase || null;

      // Only show "Rate Changed On" if there is an actual last purchase date
      const rateChangedOn = lastPurchaseDate ? (currentPurchaseDate || lastPurchaseDate) : null;
      const abcUpdatedOn = groupHistoryMap.get(g.group_id) || (g.a_rate !== null || g.b_rate !== null || g.c_rate !== null ? g.created_at : null);

      const hasRateChanged =
        currentPurchaseRate !== null &&
        lastPurchaseRate !== null &&
        Number(currentPurchaseRate) !== Number(lastPurchaseRate);

      const hasAllThreeRates =
        g.a_rate !== null && g.a_rate !== undefined && g.a_rate !== '' &&
        g.b_rate !== null && g.b_rate !== undefined && g.b_rate !== '' &&
        g.c_rate !== null && g.c_rate !== undefined && g.c_rate !== '';

      let needsReview = false;
      if (hasRateChanged) {
        if (!hasAllThreeRates || !abcUpdatedOn) {
          needsReview = true;
        } else if (rateChangedOn) {
          const rateChangedTime = new Date(rateChangedOn).getTime();
          const abcUpdatedTime = new Date(abcUpdatedOn).getTime();
          if (abcUpdatedTime < rateChangedTime) {
            needsReview = true;
          }
        }
      }

      return {
        ...g,
        current_purchase_rate: currentPurchaseRate,
        current_purchase_date: currentPurchaseDate,
        last_purchase_rate: lastPurchaseRate,
        last_purchase_date: lastPurchaseDate,
        rate_changed_on: rateChangedOn,
        abc_updated_on: abcUpdatedOn,
        has_rate_changed: hasRateChanged,
        needs_review: needsReview,
      };
    });
  } catch (error) {
    console.error('Error fetching pricing groups:', error);
    throw error;
  }
};

/**
 * Create a new product group with rates
 */
export const createPricingGroup = async ({
  group_name,
  a_rate,
  b_rate,
  c_rate,
  second_last_purchase,
  last_purchase,
  created_by,
}) => {
  try {
    const payload = {
      group_name: group_name?.trim(),
      a_rate: a_rate !== '' && a_rate !== null && a_rate !== undefined ? parseFloat(a_rate) : null,
      b_rate: b_rate !== '' && b_rate !== null && b_rate !== undefined ? parseFloat(b_rate) : null,
      c_rate: c_rate !== '' && c_rate !== null && c_rate !== undefined ? parseFloat(c_rate) : null,
      second_last_purchase: second_last_purchase || null,
      last_purchase: last_purchase || null,
      created_by: created_by || null,
    };

    const { data, error } = await supabase
      .from('product_groups')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    // Record initial rates in product_group_history
    if (data?.group_id && (payload.a_rate !== null || payload.b_rate !== null || payload.c_rate !== null)) {
      try {
        await supabase.from('product_group_history').insert([
          {
            group_id: data.group_id,
            a_rate: payload.a_rate,
            b_rate: payload.b_rate,
            c_rate: payload.c_rate,
            second_last_purchase: payload.second_last_purchase,
            last_purchase: payload.last_purchase,
            updated_at: new Date().toISOString(),
          },
        ]);
      } catch (err) {
        console.warn('Initial product_group_history insert note:', err.message);
      }
    }

    return data;
  } catch (error) {
    console.error('Error creating product group:', error);
    throw error;
  }
};

/**
 * Update rates or details for an existing product group
 */
export const updatePricingGroup = async (
  group_id,
  {
    group_name,
    a_rate,
    b_rate,
    c_rate,
    second_last_purchase,
    last_purchase,
    updated_by,
  }
) => {
  try {
    const payload = {
      group_name: group_name?.trim(),
      a_rate: a_rate !== '' && a_rate !== null && a_rate !== undefined ? parseFloat(a_rate) : null,
      b_rate: b_rate !== '' && b_rate !== null && b_rate !== undefined ? parseFloat(b_rate) : null,
      c_rate: c_rate !== '' && c_rate !== null && c_rate !== undefined ? parseFloat(c_rate) : null,
      second_last_purchase: second_last_purchase || null,
      last_purchase: last_purchase || null,
    };

    const { data, error } = await supabase
      .from('product_groups')
      .update(payload)
      .eq('group_id', group_id)
      .select()
      .single();

    if (error) throw error;

    // Log the change in product_group_history
    try {
      await supabase.from('product_group_history').insert([
        {
          group_id,
          a_rate: payload.a_rate,
          b_rate: payload.b_rate,
          c_rate: payload.c_rate,
          second_last_purchase: payload.second_last_purchase,
          last_purchase: payload.last_purchase,
          updated_at: new Date().toISOString(),
        },
      ]);
    } catch (historyErr) {
      console.warn('product_group_history insert note:', historyErr.message);
    }

    return data;
  } catch (error) {
    console.error('Error updating product group:', error);
    throw error;
  }
};

/**
 * Delete a product group
 */
export const deletePricingGroup = async (group_id) => {
  try {
    const { error } = await supabase
      .from('product_groups')
      .delete()
      .eq('group_id', group_id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting product group:', error);
    throw error;
  }
};

/**
 * Bulk delete multiple product groups
 */
export const bulkDeletePricingGroups = async (groupIds) => {
  try {
    if (!groupIds || groupIds.length === 0) return true;
    const { error } = await supabase
      .from('product_groups')
      .delete()
      .in('group_id', groupIds);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting product groups in bulk:', error);
    throw error;
  }
};

/**
 * Bulk update rates for multiple product groups and log changes in product_group_history
 */
export const bulkUpdatePricingGroups = async (updates) => {
  try {
    if (!updates || updates.length === 0) return [];

    const results = await Promise.all(
      updates.map(async ({ group_id, a_rate, b_rate, c_rate, group_name }) => {
        const payload = {
          a_rate: a_rate !== '' && a_rate !== null && a_rate !== undefined ? parseFloat(a_rate) : null,
          b_rate: b_rate !== '' && b_rate !== null && b_rate !== undefined ? parseFloat(b_rate) : null,
          c_rate: c_rate !== '' && c_rate !== null && c_rate !== undefined ? parseFloat(c_rate) : null,
        };
        if (group_name?.trim()) {
          payload.group_name = group_name.trim();
        }

        const { data, error } = await supabase
          .from('product_groups')
          .update(payload)
          .eq('group_id', group_id)
          .select()
          .single();

        if (error) throw error;

        // Log the change in product_group_history
        try {
          await supabase.from('product_group_history').insert([
            {
              group_id,
              a_rate: payload.a_rate,
              b_rate: payload.b_rate,
              c_rate: payload.c_rate,
              second_last_purchase: data?.second_last_purchase || null,
              last_purchase: data?.last_purchase || null,
              updated_at: new Date().toISOString(),
            },
          ]);
        } catch (historyErr) {
          console.warn('product_group_history insert note:', historyErr.message);
        }

        return data;
      })
    );

    return results;
  } catch (error) {
    console.error('Error updating pricing groups in bulk:', error);
    throw error;
  }
};

/**
 * Fetch rate change history for a product group
 */
export const getGroupRateHistory = async (group_id) => {
  try {
    const { data, error } = await supabase
      .from('product_group_history')
      .select(`
        id,
        group_id,
        a_rate,
        b_rate,
        c_rate,
        second_last_purchase,
        last_purchase,
        created_at,
        updated_at
      `)
      .eq('group_id', group_id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching rate history:', error);
    return [];
  }
};
