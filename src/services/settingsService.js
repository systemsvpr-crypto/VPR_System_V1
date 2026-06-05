import { supabase } from '../supabase';

export const fetchAllUsers = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const createUser = async (userData) => {
  const { password, user_id, ...rest } = userData;
  const payload = { ...rest, password_hash: password };
  const { error } = await supabase.from('users').insert([payload]);
  if (error) throw error;
};

export const updateUser = async (userId, userData) => {
  const { password, ...rest } = userData;
  const payload = password ? { ...rest, password_hash: password } : rest;
  const { error } = await supabase
    .from('users')
    .update(payload)
    .eq('user_id', userId);

  if (error) throw error;
};

export const checkUsernameExists = async (username) => {
  const { data, error } = await supabase
    .from('users')
    .select('user_id')
    .eq('username', username);

  if (error) throw error;
  return data;
};

export const checkUserIdExists = async (userId) => {
  const { data, error } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', userId);

  if (error) throw error;
  return data;
};
