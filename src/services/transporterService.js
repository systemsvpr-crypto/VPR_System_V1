import { supabase } from '../supabase';

export const getAllTransporters = async () => {
  const { data, error } = await supabase
    .from('transporters')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
};

// Every transporter also needs a matching godown (Type = Transporter) so it shows
// up in the Godown Summary / Live Stock views like any other stock location. The
// godown row is created with the SAME id as the transporter (godown_id = transporter_id)
// so the two stay linked 1:1. Best-effort: a failure here shouldn't block the
// transporter itself from being saved.
const ensureTransporterGodown = async (transporterId, name) => {
  try {
    const { data: existing, error: lookupError } = await supabase
      .from('godowns')
      .select('godown_id')
      .eq('godown_id', transporterId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return;

    const { error } = await supabase
      .from('godowns')
      .insert([{ godown_id: transporterId, name, is_active: true, godown_type: 'Transporter' }]);
    if (error) throw error;
  } catch (err) {
    console.error('Failed to auto-create matching godown for transporter:', err);
  }
};

// Turns off the linked godown when "Maintain Godown" is unchecked. Deactivates
// rather than deletes, since the godown_id may already be referenced by stock
// transactions.
const deactivateTransporterGodown = async (transporterId) => {
  try {
    const { error } = await supabase
      .from('godowns')
      .update({ is_active: false })
      .eq('godown_id', transporterId);
    if (error) throw error;
  } catch (err) {
    console.error('Failed to deactivate matching godown for transporter:', err);
  }
};

export const createTransporter = async ({ name, vehicle_number, driver_phone_number, maintainGodown = true }) => {
  const { data, error } = await supabase
    .from('transporters')
    .insert([{ name, vehicle_number, driver_phone_number }])
    .select()
    .single();
  if (error) throw error;
  if (maintainGodown) await ensureTransporterGodown(data.transporter_id, name);
  return data;
};

export const updateTransporter = async ({ transporter_id, name, vehicle_number, driver_phone_number, maintainGodown = true }) => {
  const { data, error } = await supabase
    .from('transporters')
    .update({ name, vehicle_number, driver_phone_number })
    .eq('transporter_id', transporter_id)
    .select()
    .single();
  if (error) throw error;
  if (maintainGodown) await ensureTransporterGodown(transporter_id, name);
  else await deactivateTransporterGodown(transporter_id);
  return data;
};

export const deleteTransporter = async (transporter_id) => {
  const { error } = await supabase
    .from('transporters')
    .delete()
    .eq('transporter_id', transporter_id);
  if (error) throw error;
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
      const { data, error } = await supabase.from('transporters').insert([{
        name: row.name,
        vehicle_number: row.vehicle_number || null,
        driver_phone_number: row.driver_phone_number || null,
      }]).select().single();
      if (error) throw error;
      await ensureTransporterGodown(data.transporter_id, row.name);
      results.successCount++;
    } catch (err) {
      results.errorCount++;
      results.errors.push({ row: i + 2, message: err.message });
    }
  }
  return results;
};

