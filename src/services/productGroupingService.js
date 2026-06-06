import { supabase } from '../supabase';

export const getAllGroups = async () => {
  const { data: groups, error: groupErr } = await supabase
    .from('product_groups')
    .select('*')
    .order('group_name', { ascending: true });
  if (groupErr) throw groupErr;

  const { data: members, error: memberErr } = await supabase
    .from('product_group_members')
    .select('*, products:product_id(name, unit)');
  if (memberErr) throw memberErr;

  const memberMap = {};
  for (const m of members || []) {
    if (!memberMap[m.group_id]) memberMap[m.group_id] = [];
    memberMap[m.group_id].push({
      id: m.id,
      product_id: m.product_id,
      product_name: m.products?.name || 'Unknown',
      unit: m.products?.unit || '',
    });
  }

  return (groups || []).map(g => ({
    ...g,
    members: memberMap[g.group_id] || [],
  }));
};

export const createGroup = async ({ group_name, product_ids, created_by }) => {
  const { data: group, error: groupErr } = await supabase
    .from('product_groups')
    .insert([{ group_name, created_by }])
    .select()
    .single();
  if (groupErr) throw groupErr;

  if (product_ids && product_ids.length > 0) {
    const memberRows = product_ids.map(product_id => ({
      group_id: group.group_id,
      product_id,
    }));
    const { error: memberErr } = await supabase
      .from('product_group_members')
      .insert(memberRows);
    if (memberErr) throw memberErr;
  }

  return group;
};

export const updateGroup = async (group_id, { group_name, product_ids }) => {
  const { error: groupErr } = await supabase
    .from('product_groups')
    .update({ group_name })
    .eq('group_id', group_id);
  if (groupErr) throw groupErr;

  const { error: delErr } = await supabase
    .from('product_group_members')
    .delete()
    .eq('group_id', group_id);
  if (delErr) throw delErr;

  if (product_ids && product_ids.length > 0) {
    const memberRows = product_ids.map(product_id => ({
      group_id,
      product_id,
    }));
    const { error: memberErr } = await supabase
      .from('product_group_members')
      .insert(memberRows);
    if (memberErr) throw memberErr;
  }
};

export const deleteGroup = async (group_id) => {
  const { error: delErr } = await supabase
    .from('product_group_members')
    .delete()
    .eq('group_id', group_id);
  if (delErr) throw delErr;

  const { error } = await supabase
    .from('product_groups')
    .delete()
    .eq('group_id', group_id);
  if (error) throw error;
};
