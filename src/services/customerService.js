import { supabase } from '../supabase';

export const getAllCustomers = async () => {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createCustomer = async ({ name, location, phone_number, email, gst_number, crm_follow_up }) => {
  const { data, error } = await supabase
    .from('customers')
    .insert([{ name, location, phone_number, email, gst_number, crm_follow_up }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateCustomer = async ({ customer_id, name, location, phone_number, email, gst_number, crm_follow_up }) => {
  const { data, error } = await supabase
    .from('customers')
    .update({ name, location, phone_number, email, gst_number, crm_follow_up })
    .eq('customer_id', customer_id)
    .select()
    .single();
  if (error) throw error;
  return data;
};
