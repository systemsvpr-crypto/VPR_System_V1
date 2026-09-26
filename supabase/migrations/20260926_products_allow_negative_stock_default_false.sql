-- New products must not allow negative stock by default. The column
-- originally defaulted to true, so any insert that omitted it (or went
-- through a path that dropped it) silently created products that could be
-- dispatched/sold below zero.
ALTER TABLE public.products
  ALTER COLUMN allow_negative_stock SET DEFAULT false;
