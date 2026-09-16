import { supabase } from '../supabase';

export const getAllRanks = async () => {
  const { data, error } = await supabase
    .from('ranks')
    .select('*')
    .order('rank_name', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createRank = async (rank_name) => {
  const { data, error } = await supabase
    .from('ranks')
    .insert([{ rank_name }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateRank = async (rank_id, rank_name) => {
  const { data, error } = await supabase
    .from('ranks')
    .update({ rank_name, updated_at: new Date().toISOString() })
    .eq('rank_id', rank_id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteRank = async (rank_id) => {
  const { error } = await supabase
    .from('ranks')
    .delete()
    .eq('rank_id', rank_id);
  if (error) throw error;
};
