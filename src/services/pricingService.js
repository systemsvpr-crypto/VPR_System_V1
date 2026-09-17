import { supabase } from '../supabase';

/**
 * Fetch all product groups with pricing information
 */
export const getAllPricingGroups = async () => {
  try {
    const { data: groups, error } = await supabase
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
      .order('group_name', { ascending: true });

    if (error) {
      // Fallback without join in case users relation is restricted
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('product_groups')
        .select('*')
        .order('group_name', { ascending: true });

      if (fallbackError) throw fallbackError;
      return fallbackData || [];
    }

    return groups || [];
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

    // Optional manual history insert fallback in case DB trigger is not yet configured
    try {
      await supabase.from('product_group_history').insert([
        {
          group_id,
          a_rate: payload.a_rate,
          b_rate: payload.b_rate,
          c_rate: payload.c_rate,
          created_by: updated_by || null,
        },
      ]);
    } catch {
      // Trigger may have handled it or history table is optional
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
 * Fetch rate change history for a product group
 */
export const getGroupRateHistory = async (group_id) => {
  try {
    const { data, error } = await supabase
      .from('product_group_history')
      .select(`
        history_id,
        group_id,
        a_rate,
        b_rate,
        c_rate,
        created_at,
        created_by,
        user:created_by(user_id, full_name, username)
      `)
      .eq('group_id', group_id)
      .order('created_at', { ascending: false });

    if (error) {
      // Fallback without user join
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('product_group_history')
        .select('*')
        .eq('group_id', group_id)
        .order('created_at', { ascending: false });

      if (fallbackError) throw fallbackError;
      return fallbackData || [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching rate history:', error);
    return [];
  }
};
