-- Ensure godowns.godown_type exists (Own / Transporter), defaulting existing rows to 'Own'
ALTER TABLE public.godowns ADD COLUMN IF NOT EXISTS godown_type text NOT NULL DEFAULT 'Own';

-- One-time backfill: give every existing transporter a matching godown row
-- (Type = Transporter) so it shows up in the Godown Summary / Live Stock
-- views like any other stock location. Skips any transporter that already
-- has a godown of the same name.
INSERT INTO public.godowns (name, is_active, godown_type)
SELECT t.name, true, 'Transporter'
FROM public.transporters t
WHERE NOT EXISTS (
  SELECT 1 FROM public.godowns g WHERE g.name = t.name
);
