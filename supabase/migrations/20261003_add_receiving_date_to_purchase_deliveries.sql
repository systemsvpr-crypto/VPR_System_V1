-- Aawak Details tab's "Receiving Date" — picked per lift and auto-saved.
ALTER TABLE public.purchase_deliveries
  ADD COLUMN IF NOT EXISTS receiving_date date;
