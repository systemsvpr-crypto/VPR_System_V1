-- Purchase Delivery: alongside received_quantity (entered in the product's
-- master unit, unchanged), record the same dispatch broken out into both
-- Bag and Kg — whichever matches the master unit mirrors received_quantity,
-- the other is derived from it via that delivery's own packaging_size.
ALTER TABLE public.purchase_deliveries ADD COLUMN IF NOT EXISTS dispatch_qty_bag numeric;
ALTER TABLE public.purchase_deliveries ADD COLUMN IF NOT EXISTS dispatch_qty_kg numeric;
