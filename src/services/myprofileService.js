import { supabase } from '../supabase';

const queryProfile = async (field, value) => {
  if (!value) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq(field, value)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
};

// The stored session can hold a stale user_id, so fall back to username.
export const fetchProfile = async (identifier, field = 'user_id', fallbackUsername) => {
  let data = await queryProfile(field, identifier);
  if (!data && field !== 'username') data = await queryProfile('username', fallbackUsername);
  if (!data) throw new Error('User profile not found. Please log out and log in again.');

  return data;
};

export const updateProfile = async (userId, data) => {
  const { error } = await supabase
    .from('users')
    .update(data)
    .eq('user_id', userId);

  if (error) throw error;
};
