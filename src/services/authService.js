import { supabase } from '../supabase';

export const loginUser = async (username, password) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .single();

  if (error || !user) {
    throw new Error('Invalid credentials');
  }

  if (user.password_hash !== password) {
    throw new Error('Invalid credentials');
  }

  if (user.is_active === false) {
    throw new Error('Your account has been deactivated. Please contact the administrator.');
  }

  return user;
};
