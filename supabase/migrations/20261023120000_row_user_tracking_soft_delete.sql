-- Row-level user tracking + soft delete (no separate log table).
--
-- Every app table gets these columns (only added where missing):
--   created_by / created_by_name   who created the row
--   updated_by / updated_by_name   who last edited it, updated_at = when
--   is_deleted / deleted_by / deleted_by_name / deleted_at   who "deleted" it
-- A DELETE no longer removes the row: it marks it is_deleted = true and stores
-- who did it. The app hides is_deleted rows (src/supabase.js, VITE_SOFT_DELETE=on).
--
-- VPR logs in through its own `users` table, so the browser sends the current
-- user in the `x-app-user-id` / `x-app-username` request headers and the
-- triggers read them from PostgREST's `request.headers`. Changes made outside
-- the app (SQL editor, service role) leave the user columns empty.
--
-- holidays and working_day_calender are left out on purpose: they stay hard-delete.
--
-- To really remove a row (purge), run in the SQL editor:
--   begin; set local app.hard_delete = 'on'; delete from <table> where ...; commit;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname not in ('whatsapp_logs', 'daily_snapshots', 'holidays', 'working_day_calender')
  loop
    execute format(
      'alter table public.%I
         add column if not exists created_by_name text,
         add column if not exists updated_by text,
         add column if not exists updated_by_name text,
         add column if not exists updated_at timestamptz,
         add column if not exists is_deleted boolean not null default false,
         add column if not exists deleted_by text,
         add column if not exists deleted_by_name text,
         add column if not exists deleted_at timestamptz', t.relname);

    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t.relname and column_name = 'created_by'
    ) then
      execute format('alter table public.%I add column created_by text', t.relname);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Unique constraints must ignore soft-deleted rows, otherwise a deleted
--    username / order number could never be reused. Each one becomes a unique
--    index "where not is_deleted". (A constraint another table's foreign key
--    depends on is left as it is; see the NOTICE output.)
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select con.conname,
           con.conrelid::regclass as tbl,
           (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
              from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cols
      from pg_constraint con
      join pg_class r on r.oid = con.conrelid
      join pg_namespace n on n.oid = r.relnamespace
     where con.contype = 'u'
       and n.nspname = 'public'
       and r.relname not in ('whatsapp_logs', 'daily_snapshots', 'holidays', 'working_day_calender')
  loop
    begin
      execute format('alter table %s drop constraint %I', c.tbl, c.conname);
      execute format('create unique index %I on %s (%s) where not is_deleted', c.conname, c.tbl, c.cols);
    exception when others then
      raise notice 'Unique constraint % on % left unchanged: %', c.conname, c.tbl, sqlerrm;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------
create or replace function public.app_request_user(out v_uid text, out v_username text, out v_name text)
language plpgsql
stable
as $$
declare
  hdr json;
begin
  begin
    hdr := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    hdr := null;
  end;
  v_uid := nullif(hdr->>'x-app-user-id', '');
  v_username := nullif(hdr->>'x-app-username', '');
  if v_uid is not null then
    begin
      select full_name into v_name from public.users where user_id::text = v_uid;
    exception when others then
      v_name := null;
    end;
  end if;
  v_name := coalesce(v_name, v_username);
end;
$$;

-- Fills created_by / updated_by on the way in.
create or replace function public.track_row_change()
returns trigger
language plpgsql
as $$
declare
  u record;
  v jsonb := to_jsonb(new);
  patch jsonb := '{}'::jsonb;
begin
  select * into u from public.app_request_user();

  if tg_op = 'INSERT' then
    if u.v_uid is not null then
      if v ? 'created_by' and v->>'created_by' is null then
        patch := patch || jsonb_build_object('created_by', u.v_uid);
      end if;
      if v ? 'created_by_name' and v->>'created_by_name' is null then
        patch := patch || jsonb_build_object('created_by_name', u.v_name);
      end if;
    end if;
  else
    -- The soft delete itself is stamped by soft_delete_row().
    if coalesce((v->>'is_deleted')::boolean, false) and not coalesce((to_jsonb(old)->>'is_deleted')::boolean, false) then
      return new;
    end if;
    patch := jsonb_build_object('updated_at', now());
    if u.v_uid is not null then
      patch := patch || jsonb_build_object('updated_by', u.v_uid, 'updated_by_name', u.v_name);
    end if;
  end if;

  if patch <> '{}'::jsonb then
    begin
      new := jsonb_populate_record(new, patch);
    exception when others then
      -- e.g. a non-uuid id for a uuid created_by: never block the real change.
      null;
    end;
  end if;
  return new;
end;
$$;

-- Turns DELETE into "mark as deleted + remember who".
create or replace function public.soft_delete_row()
returns trigger
language plpgsql
as $$
declare
  u record;
  where_sql text;
  old_json jsonb := to_jsonb(old);
begin
  if current_setting('app.hard_delete', true) = 'on' then
    return old;
  end if;

  -- Match the row by its primary key (tables without one stay hard-delete).
  select string_agg(
           format('%I = (%L::jsonb ->> %L)::%s', a.attname, old_json::text, a.attname, format_type(a.atttypid, a.atttypmod)),
           ' and ')
    into where_sql
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey::int2[])
   where i.indrelid = tg_relid and i.indisprimary;

  if where_sql is null then
    return old;
  end if;

  select * into u from public.app_request_user();

  execute format(
    'update %I.%I set is_deleted = true, deleted_by = $1, deleted_by_name = $2, deleted_at = now()
      where %s and not is_deleted',
    tg_table_schema, tg_table_name, where_sql)
  using u.v_uid, u.v_name;

  return null; -- cancel the real delete
end;
$$;

do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname not in ('whatsapp_logs', 'daily_snapshots', 'holidays', 'working_day_calender')
  loop
    execute format('drop trigger if exists track_row_change on public.%I', t.relname);
    execute format('drop trigger if exists soft_delete_row on public.%I', t.relname);
    execute format(
      'create trigger track_row_change before insert or update on public.%I
         for each row execute function public.track_row_change()', t.relname);
    execute format(
      'create trigger soft_delete_row before delete on public.%I
         for each row execute function public.soft_delete_row()', t.relname);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Views that read the tables directly must skip soft-deleted rows too
--    (the app filters its own table reads, but not what a view computes).
--    These are the latest definitions from the earlier migrations with only
--    the is_deleted condition added. If you changed any of them since, merge
--    the condition into your version instead of running this section.
-- ---------------------------------------------------------------------------

-- Live stock: a soft-deleted transaction must stop counting.
drop view if exists public.godown_stock;
create view public.godown_stock
with (security_invoker = on) as
select
  product_id,
  godown_id,
  sum(
    case
      when txn_type = any (
        array[
          'OPEN_STOCK'::txn_type,
          'IN_FACTORY'::txn_type,
          'PRODUCTION_IN'::txn_type,
          'TRANSFER_IN'::txn_type,
          'ADJUSTMENT_IN'::txn_type,
          'PURCHASE_IN'::txn_type
        ]
      ) then qty
      else - qty
    end
  ) as current_stock
from transactions
where is_void = false
  and is_deleted = false
group by product_id, godown_id;
grant select on public.godown_stock to anon, authenticated, service_role;

-- Checklist employees: a soft-deleted VPR user disappears from the list.
create or replace view public.checklist_users as
select
  p.id,
  u.user_id                                           as vpr_user_id,
  coalesce(nullif(trim(u.full_name), ''), u.username) as user_name,
  u.email                                             as email_id,
  u.phone_number                                      as number,
  u.designation                                       as "Designation",
  u.profile_picture                                   as profile_image,
  case
    when upper(u.role) in ('SUPER ADMIN', 'SUPER_ADMIN', 'SUPERADMIN') then 'ADMINISTRATOR'
    when upper(u.role) like '%ADMIN%' then 'admin'
    else 'user'
  end                                                 as role,
  case when u.is_active then 'active' else 'inactive' end as status,
  p.department,
  p.user_access,
  p.page_access,
  p.reported_by,
  p.day_off,
  p.leave_date,
  p.leave_end_date,
  p.remark,
  coalesce(p.can_self_assign, false)                  as can_self_assign,
  p.employee_id,
  p.location,
  u.created_at
from public.users u
left join public.checklist_user_profiles p on u.user_id = p.user_id
where u.is_deleted = false;

-- Checklist "one row per series" list: ignore soft-deleted tasks.
-- (drop + create: `c.*` is expanded when the view is created, and the table
-- gained new columns above.)
drop view if exists public.checklist_unique_tasks;
create view public.checklist_unique_tasks
with (security_invoker = true) as
select s.*
from (
  select
    c.*,
    row_number() over (series order by c.planned_date desc nulls last, c.task_id desc) as series_rank,
    count(*) over (series) as open_occurrences
  from public.checklist c
  where (c.submission_date is null or c.status in ('extend', 'extended'))
    and c.is_deleted = false
  window series as (
    partition by
      coalesce(btrim(c.department), ''),
      coalesce(btrim(c.task_description), ''),
      coalesce(btrim(c.name), '')
  )
) s
where s.series_rank = 1;
grant select on public.checklist_unique_tasks to anon, authenticated, service_role;
