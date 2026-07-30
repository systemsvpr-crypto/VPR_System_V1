import { supabase } from '../supabase';

export const getAllVendors = async () => {
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createVendor = async ({ name, location, phone_number, email, gst_number }) => {
  const { data, error } = await supabase
    .from('vendors')
    .insert([{ name, location, phone_number, email, gst_number }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateVendor = async ({ vendor_id, name, location, phone_number, email, gst_number }) => {
  const { data, error } = await supabase
    .from('vendors')
    .update({ name, location, phone_number, email, gst_number })
    .eq('vendor_id', vendor_id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteVendor = async (vendor_id) => {
  const { error } = await supabase
    .from('vendors')
    .delete()
    .eq('vendor_id', vendor_id);
  if (error) throw error;
};

export const bulkImportVendors = async (rows) => {
  const results = { successCount: 0, errorCount: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name) {
      results.errorCount++;
      results.errors.push({ row: i + 2, message: 'Name is required' });
      continue;
    }
    try {
      const { error } = await supabase.from('vendors').insert([{
        name: row.name,
        phone_number: row.phone_number || null,
        email: row.email || null,
        location: row.location || null,
        gst_number: row.gst_number || null,
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

