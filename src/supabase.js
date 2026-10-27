import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Soft delete: the database no longer removes rows, it marks them is_deleted
// (see supabase/migrations/*_row_user_tracking_soft_delete.sql). Reads must
// therefore skip those rows. Off until VITE_SOFT_DELETE=on is set, so the app
// keeps working unchanged until the migration has been run.
const SOFT_DELETE_ON = import.meta.env.VITE_SOFT_DELETE === 'on';
// Views and log tables have no is_deleted column of their own; holidays and the
// working-day calendar are deliberately hard-deleted. The WhatsApp module uses
// deleted_at instead of is_deleted.
const NO_SOFT_DELETE = new Set([
  'whatsapp_logs',
  'whatsapp_contacts_metadata',
  'whatsapp_bulk_contacts',
  'whatsapp_templates',
  'whatsapp_conversations',
  'whatsapp_messages',
  'whatsapp_message_status_history',
  'whatsapp_broadcast_schedules',
  'vw_whatsapp_chat_inbox',
  'daily_snapshots',
  'godown_stock',
  'checklist_users',
  'checklist_unique_tasks',
  'holidays',
  'working_day_calender',
]);
const isNoSoftDelete = (name) => {
  if (!name) return false;
  return NO_SOFT_DELETE.has(name) || name.startsWith('whatsapp_') || name.startsWith('vw_whatsapp_');
};
// Master data embedded in another row ("deliveries -> transporters(name)") stays
// visible even after it is soft-deleted, so history keeps showing the old name.
// Reading the master table itself still hides deleted rows.
const KEEP_WHEN_EMBEDDED = new Set(['customers', 'vendors', 'transporters', 'products', 'product_groups', 'godowns', 'ranks', 'users', 'divisions']);
const AGGREGATES = new Set(['count', 'sum', 'avg', 'min', 'max']);

// Embedded resources in `select=` ("a(*,b(*))") need their own filter path
// ("a.is_deleted", "a.b.is_deleted"); alias:target!hint(...) is addressed by alias.
const KEEP = Symbol('keep');
const embedPaths = (select) => {
  const paths = [];
  const stack = [];
  let token = '';
  for (const ch of select) {
    if (ch === '(') {
      const raw = token.trim();
      const name = raw.includes(':') ? raw.split(':')[0] : raw.split('!')[0];
      const isEmbed = name && !raw.includes('.') && !AGGREGATES.has(name) && !isNoSoftDelete(name);
      // A kept (master-data) embed and everything nested in it is left unfiltered.
      const keep = stack.includes(KEEP) || (isEmbed && KEEP_WHEN_EMBEDDED.has(name));
      stack.push(keep ? KEEP : isEmbed ? name : null);
      if (isEmbed && !keep) paths.push(stack.filter(x => x && x !== KEEP).join('.'));
      token = '';
    } else if (ch === ')') {
      stack.pop();
      token = '';
    } else if (ch === ',') {
      token = '';
    } else {
      token += ch;
    }
  }
  return paths;
};

const hideDeleted = (url, method) => {
  if (!SOFT_DELETE_ON || (method !== 'GET' && method !== 'HEAD')) return url;
  const m = url.match(/\/rest\/v1\/([^/?]+)(\?|$)/);
  if (!m || isNoSoftDelete(m[1])) return url;
  // A query that already filters on is_deleted itself (e.g. .in('is_deleted', [true, false]))
  // opts out, so callers can see deleted rows when they must (number sequences, audits).
  if (/[?&]is_deleted=/.test(url)) return url;
  let extra = 'is_deleted=eq.false';
  const sel = url.match(/[?&]select=([^&]*)/);
  if (sel) {
    for (const p of embedPaths(decodeURIComponent(sel[1]))) extra += `&${p}.is_deleted=eq.false`;
  }
  return url + (url.includes('?') ? '&' : '?') + extra;
};

// Tells the database which app user is making each data request, so its
// triggers can record who created / edited / deleted a row. VPR logs in through
// its own `users` table, not Supabase Auth, so the user rides along as request
// headers. Read fresh from localStorage on every call; only data (REST)
// requests are touched, and any failure here just sends the request unchanged.
const withAppUser = (input, init = {}) => {
  try {
    const url = typeof input === 'string' ? input : input?.url;
    if (url && url.includes('/rest/v1/')) {
      const method = String(init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
      const target = typeof input === 'string' ? hideDeleted(url, method) : input;
      const u = JSON.parse(localStorage.getItem('user') || 'null');
      if (u?.user_id || u?.username) {
        const headers = new Headers(init.headers || (typeof input === 'string' ? undefined : input.headers));
        if (u.user_id) headers.set('x-app-user-id', encodeURIComponent(u.user_id));
        if (u.username) headers.set('x-app-username', encodeURIComponent(u.username));
        return fetch(target, { ...init, headers });
      }
      return fetch(target, init);
    }
  } catch {
    // fall through to the plain request
  }
  return fetch(input, init);
};

export const supabase = createClient(supabaseUrl, supabaseKey, { global: { fetch: withAppUser } })

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
  for (; ;) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
};

// Supabase's API gateway rejects a request with a bare 400 "Bad Request" once
// its URL gets too long — an `.in()` filter built from every id in a growing
// table (e.g. every approved indent item) crosses that line as data grows.
// Split the id list into bounded chunks, page each chunk's result with
// fetchAllRows (so no chunk is silently capped at 1000 rows), and merge.
//
// `buildQuery(chunk)` must return a FRESH, un-awaited query builder.
const IN_CHUNK_SIZE = 150;

export const fetchAllRowsInChunks = async (ids, buildQuery) => {
  let rows = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE);
    rows = rows.concat(await fetchAllRows(() => buildQuery(chunk)));
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
  for (; ;) {
    const { data, error, count: c } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (typeof c === 'number') count = c;
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: rows, count };
};
