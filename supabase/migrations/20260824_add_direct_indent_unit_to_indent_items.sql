-- Create Indent (direct indent line items): record which unit (bag/kg) the
-- Qty was actually entered in, and the raw as-typed figure in that unit.
-- quantity/indent_qty (kept in sync, converted via the product's Mux/Pkg
-- size) stay in the product's master unit regardless, since that's what
-- drives the rest of the purchase pipeline — same convention as
-- approve_unit/approve_unit_qty and reorder_unit/reorder_unit_qty.
ALTER TABLE public.purchase_indent_items ADD COLUMN IF NOT EXISTS direct_indent_unit text;
ALTER TABLE public.purchase_indent_items ADD COLUMN IF NOT EXISTS direct_indent_qty numeric;
