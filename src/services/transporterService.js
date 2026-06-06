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
