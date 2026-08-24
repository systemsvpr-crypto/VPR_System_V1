-- Indent Pending (Vendor Approval planning step): record which unit
-- (bag/kg) the Approved Qty was actually entered in, and the raw as-typed
-- figure in that unit. approve_qty (mirrored into quantity, kept in sync)
-- stays in the product's master unit regardless, since that's what drives
-- the rest of the purchase pipeline.
ALTER TABLE public.purchase_indent_items ADD COLUMN IF NOT EXISTS approve_unit text;
ALTER TABLE public.purchase_indent_items ADD COLUMN IF NOT EXISTS approve_unit_qty numeric;
ALTER TABLE public.purchase_indent_items ADD COLUMN IF NOT EXISTS approve_qty numeric;
