-- Fix 401 Unauthorized for product_group_history table in Supabase
-- When new tables are created in Supabase, Row Level Security (RLS) is enabled by default
-- without any policies, which blocks client-side anon requests with HTTP 401 / 403.

-- 1. Grant table and sequence permissions to anon, authenticated, and service_role
GRANT ALL ON TABLE public.product_group_history TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 2. Enable RLS and add permissive policies (matching ranks and other tables in this app)
ALTER TABLE public.product_group_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access on product_group_history" ON public.product_group_history;
CREATE POLICY "Allow read access on product_group_history" ON public.product_group_history
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert access on product_group_history" ON public.product_group_history;
CREATE POLICY "Allow insert access on product_group_history" ON public.product_group_history
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update access on product_group_history" ON public.product_group_history;
CREATE POLICY "Allow update access on product_group_history" ON public.product_group_history
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete access on product_group_history" ON public.product_group_history;
CREATE POLICY "Allow delete access on product_group_history" ON public.product_group_history
  FOR DELETE USING (true);
