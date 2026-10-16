-- Rank status: only active ranks get a rate column in the Pricing table.
ALTER TABLE public.ranks
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Existing ranks (A, B, C, D ...) stay active.
UPDATE public.ranks SET is_active = true WHERE is_active IS NULL;

-- To mark a rank inactive (example):
-- UPDATE public.ranks SET is_active = false WHERE rank_name = 'D';
