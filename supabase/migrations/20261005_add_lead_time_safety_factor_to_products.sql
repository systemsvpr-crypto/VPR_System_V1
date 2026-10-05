-- Product master's "Lead Time" (days) and "Safety Factor" — entered on the
-- Add/Edit Product form and the product Excel import.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS lead_time numeric,
  ADD COLUMN IF NOT EXISTS safety_factor numeric;
