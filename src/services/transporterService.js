import { supabase } from '../supabase';

export const getAllTransporters = async () => {
  const { data, error } = await supabase
    .from('transporters')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createTransporter = async ({ name, vehicle_number, driver_phone_number }) => {
  const { data, error } = await supabase
    .from('transporters')
    .insert([{ name, vehicle_number, driver_phone_number }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateTransporter = async ({ transporter_id, name, vehicle_number, driver_phone_number }) => {
  const { data, error } = await supabase
    .from('transporters')
    .update({ name, vehicle_number, driver_phone_number })
    .eq('transporter_id', transporter_id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const bulkImportTransporters = async (rows) => {
  const results = { successCount: 0, errorCount: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name) {
      results.errorCount++;
      results.errors.push({ row: i + 2, message: 'Name is required' });
      continue;
    }
    try {
      const { error } = await supabase.from('transporters').insert([{
        name: row.name,
        vehicle_number: row.vehicle_number || null,
        driver_phone_number: row.driver_phone_number || null,
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

