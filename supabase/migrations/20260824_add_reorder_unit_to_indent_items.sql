-- Ultimate IMS Reorder: record which unit (bag/kg) the reorder qty was
-- actually entered in, and the raw as-typed figure in that unit. quantity
-- stays in the product's master unit regardless (converted from this unit
-- by the caller), since that's what drives the purchase pipeline and stock.
ALTER TABLE public.purchase_indent_items ADD COLUMN IF NOT EXISTS reorder_unit text;
ALTER TABLE public.purchase_indent_items ADD COLUMN IF NOT EXISTS reorder_unit_qty numeric;
