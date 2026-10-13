-- Delivery tab → Pending delete log. Deleting a pending item (or the
-- undispatched remainder of a partly dispatched one) removes it from the
-- pipeline; this keeps a snapshot of what was deleted so the Delivery
-- History view can still list it, marked "Deleted".
CREATE TABLE IF NOT EXISTS public.purchase_delivery_deletions (
  deletion_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid,
  indent_id       uuid,
  indent_number   text,
  indent_date     date,
  process_type    text,
  product_id      uuid,
  product_name    text,
  product_unit    text,
  group_id        uuid,
  vendor_name     text,
  rate            numeric,
  deleted_qty     numeric NOT NULL DEFAULT 0,
  delete_type     text NOT NULL DEFAULT 'item', -- 'item' | 'remainder'
  deleted_by      uuid,
  deleted_by_name text,
  deleted_at      timestamptz NOT NULL DEFAULT now(),
  -- Full copy of everything deleted, as it was at delete time: the
  -- purchase_indent_items row (every column) plus its indent header,
  -- product and vendor rows. The columns above are just the bits History
  -- displays/filters on.
  item_data       jsonb,
  indent_data     jsonb,
  product_data    jsonb,
  vendor_data     jsonb
);

-- Safe to re-run if an earlier version of this table already exists.
ALTER TABLE public.purchase_delivery_deletions
  ADD COLUMN IF NOT EXISTS item_data    jsonb,
  ADD COLUMN IF NOT EXISTS indent_data  jsonb,
  ADD COLUMN IF NOT EXISTS product_data jsonb,
  ADD COLUMN IF NOT EXISTS vendor_data  jsonb;

GRANT ALL ON TABLE public.purchase_delivery_deletions TO anon, authenticated, service_role;

ALTER TABLE public.purchase_delivery_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access on purchase_delivery_deletions" ON public.purchase_delivery_deletions;
CREATE POLICY "Allow read access on purchase_delivery_deletions" ON public.purchase_delivery_deletions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert access on purchase_delivery_deletions" ON public.purchase_delivery_deletions;
CREATE POLICY "Allow insert access on purchase_delivery_deletions" ON public.purchase_delivery_deletions
  FOR INSERT WITH CHECK (true);

-- Only used to undo a saved copy when the delete it was made for then fails.
DROP POLICY IF EXISTS "Allow delete access on purchase_delivery_deletions" ON public.purchase_delivery_deletions;
CREATE POLICY "Allow delete access on purchase_delivery_deletions" ON public.purchase_delivery_deletions
  FOR DELETE USING (true);
