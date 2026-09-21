import { supabase } from '../supabase';

export const getAllCustomers = async () => {
  const { data, error } = await supabase
    .from('customers')
    .select(`
      *,
      ranks (
        rank_id,
        rank_name
      )
    `)
    .order('name', { ascending: true });
  if (error) {
    const fallback = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });
    if (fallback.error) throw error;
    return fallback.data || [];
  }
  return data || [];
};

export const createCustomer = async ({ name, location, phone_number, email, gst_number, crm_follow_up, rank_id }) => {
  const { data, error } = await supabase
    .from('customers')
    .insert([{
      name,
      location,
      phone_number,
      email,
      gst_number,
      crm_follow_up,
      rank_id: rank_id || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateCustomer = async ({ customer_id, name, location, phone_number, email, gst_number, crm_follow_up, rank_id }) => {
  const { data, error } = await supabase
    .from('customers')
    .update({
      name,
      location,
      phone_number,
      email,
      gst_number,
      crm_follow_up,
      rank_id: rank_id || null,
    })
    .eq('customer_id', customer_id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteCustomer = async (customer_id) => {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('customer_id', customer_id);
  if (error) throw error;
};

export const bulkImportCustomers = async (rows) => {
  const results = { successCount: 0, errorCount: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name) {
      results.errorCount++;
      results.errors.push({ row: i + 2, message: 'Name is required' });
      continue;
    }
    try {
      const { error } = await supabase.from('customers').insert([{
        name: row.name,
        phone_number: row.phone_number || null,
        email: row.email || null,
        location: row.location || null,
        gst_number: row.gst_number || null,
        crm_follow_up: row.crm_follow_up || null,
        rank_id: row.rank_id || null,
      }]);
      if (error) throw error;
      results.successCount++;
    } catch (err) {
      results.errorCount++;
      results.errors.push({ row: i + 2, message: err.message });
    }
  }
  return results;
};

