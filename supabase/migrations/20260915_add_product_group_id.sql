-- Every product now auto-joins a product_groups row keyed by its own Brand
-- Name + Category, concatenated as typed (e.g. Brand "AA" + Category "BB" ->
-- group_name "AABB") — see masterService.js's resolveProductGroupId, which
-- creates that row the first time a given Brand+Category combo is seen and
-- reuses the same group_id for it afterwards (case-insensitively — "Aa"+"BB"
-- reuses the "AABB" row already created for "AA"+"BB" rather than creating a
-- near-duplicate group).
-- ON DELETE SET NULL: product_groups already has its own manual "Product
-- Grouping" management UI (delete a group there) — a group being deleted
-- that way should just unlink whatever products auto-joined it, not block
-- the delete outright.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.product_groups(group_id) ON DELETE SET NULL;

-- Backfill: give every pre-existing product a group too, using the same
-- Brand+Category rule, so grouping isn't only populated going forward.
DO $$
DECLARE
  r RECORD;
  gid uuid;
BEGIN
  FOR r IN
    SELECT product_id,
           (trim(coalesce(brand_name, '')) || trim(coalesce(category, ''))) AS combined
    FROM public.products
    WHERE group_id IS NULL
  LOOP
    IF r.combined = '' THEN
      CONTINUE;
    END IF;

    SELECT group_id INTO gid
      FROM public.product_groups
      WHERE lower(group_name) = lower(r.combined)
      LIMIT 1;

    IF gid IS NULL THEN
      INSERT INTO public.product_groups (group_name) VALUES (r.combined)
        RETURNING group_id INTO gid;
    END IF;

    UPDATE public.products SET group_id = gid WHERE product_id = r.product_id;
  END LOOP;
END $$;
