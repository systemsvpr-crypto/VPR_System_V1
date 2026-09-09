import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// PostgREST (Supabase's query API) caps every request at a server-side max
// row count — 1000 by default — no matter how many rows actually match the
// filter, and it does this silently: no error, just a truncated result. Any
// query that can grow past that (the transactions ledger chiefly, but also
// godown_stock once products × godowns crosses 1000) must page through with
// `.range()` until a page comes back short of PAGE_SIZE, or the app quietly
// drops rows once the table grows — exactly the "today's opening doesn't
// match yesterday's closing" bug this fixes.
//
// `buildQuery` must be a function that returns a FRESH query builder each
// call (e.g. `() => supabase.from('transactions').select('*').eq(...)`),
// not an already-built/awaited query — each page needs its own builder.
const PAGE_SIZE = 1000;

export const fetchAllRows = async (buildQuery) => {
  let rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
};

// Same as fetchAllRows, but for a query built with `{ count: 'exact' }` where
// the caller also needs the total matching-row count (e.g. for a "total
// products" figure) — Postgrest reports that exact count on every page's
// response regardless of the `.range()` used, so any one page's `count` is
// the real total.
export const fetchAllRowsWithCount = async (buildQuery) => {
  let rows = [];
  let from = 0;
  let count = 0;
  for (;;) {
    const { data, error, count: c } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (typeof c === 'number') count = c;
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: rows, count };
};
