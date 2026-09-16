-- Ranks — a simple named master-data list under Master, same shape/CRUD
-- convention as Godowns/Transporters (create, edit, delete), managed via
-- rankService.js.
CREATE TABLE IF NOT EXISTS public.ranks (
  rank_id uuid NOT NULL DEFAULT gen_random_uuid(),
  rank_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ranks_pkey PRIMARY KEY (rank_id)
);

-- This app authorizes at the application layer (tab_access per user), not
-- per-row in Postgres, so RLS stays enabled here only to satisfy Supabase's
-- own "RLS should be on" linter — every policy below is fully permissive,
-- matching how every other table in this app is actually reachable (freely,
-- via the anon key). This is NOT real row-level access control.
ALTER TABLE public.ranks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access on ranks" ON public.ranks
  FOR SELECT USING (true);

CREATE POLICY "Allow insert access on ranks" ON public.ranks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update access on ranks" ON public.ranks
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete access on ranks" ON public.ranks
  FOR DELETE USING (true);
