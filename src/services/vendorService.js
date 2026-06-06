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
