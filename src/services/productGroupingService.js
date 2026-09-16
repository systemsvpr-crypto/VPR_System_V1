import { supabase, fetchAllRows } from '../supabase';

export const getAllGroups = async () => {
  const { data: groups, error: groupErr } = await supabase
    .from('product_groups')
    .select('*')
    .order('group_name', { ascending: true });
  if (groupErr) throw groupErr;

  // Manually-curated members — someone building a group by hand via this
  // page's own Add/Edit Group form (the product_group_members join table).
  const { data: members, error: memberErr } = await supabase
    .from('product_group_members')
    .select('*, products:product_id(name, unit)');
  if (memberErr) throw memberErr;

  // Auto-linked members — every product whose own group_id already points
  // here (see masterService.js's resolveProductGroupId, which links a
  // product to its Brand+Category group the moment it's created/edited).
  // This is how a product actually ends up "in" a group day to day; the
  // join table above only ever gets rows from a deliberate manual pick.
  const linkedProducts = await fetchAllRows(() => supabase
    .from('products')
    .select('product_id, name, unit, group_id')
    .not('group_id', 'is', null));

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

  const linkedMap = {};
  for (const p of linkedProducts || []) {
    if (!linkedMap[p.group_id]) linkedMap[p.group_id] = [];
    linkedMap[p.group_id].push({
      id: `auto-${p.product_id}`,
      product_id: p.product_id,
      product_name: p.name || 'Unknown',
      unit: p.unit || '',
    });
  }

  return (groups || []).map(g => {
    const manualMembers = memberMap[g.group_id] || [];
    const linked = linkedMap[g.group_id] || [];
    // Combined, de-duplicated view for display (Products count + expanded
    // list) — every auto-linked product, plus any manually-added member not
    // already covered by that link.
    const linkedIds = new Set(linked.map(p => p.product_id));
    const allProducts = [...linked, ...manualMembers.filter(m => !linkedIds.has(m.product_id))];
    return {
      ...g,
      members: manualMembers, // unchanged — still exactly what Edit Group's checkboxes use
      allProducts,            // what the table's Products count + expanded list show
    };
  });
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
