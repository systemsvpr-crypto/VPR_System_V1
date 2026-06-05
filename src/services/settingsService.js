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
  const { error } = await supabase.from('users').insert([userData]);
  if (error) throw error;
};

export const updateUser = async (userId, userData) => {
  const { error } = await supabase
    .from('users')
    .update(userData)
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
