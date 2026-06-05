import { supabase } from '../supabase';

export const fetchProfile = async (identifier, field = 'user_id') => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq(field, identifier)
    .single();

  if (error) throw error;
  if (!data) throw new Error('User profile not found.');

  return data;
};

export const updateProfile = async (userId, data) => {
  const { error } = await supabase
    .from('users')
    .update(data)
    .eq('user_id', userId);

  if (error) throw error;
};
