-- Create Order (sales order line items): record which unit (bag/kg) the Qty
-- was actually entered in, and the raw as-typed figure in that unit.
-- quantity stays in the product's master unit regardless (converted via the
-- product's Mux/Pkg size), since that's what drives stock/dispatch — same
-- convention as purchase_indent_items.direct_indent_unit/direct_indent_qty.
--
-- Column name is "Selected_Unit" (quoted/mixed-case) per spec, unlike the
-- rest of the schema's lowercase snake_case columns — reference it quoted
-- in raw SQL, and as "Selected_Unit" (exact case) in supabase-js calls.
ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS "Selected_Unit" text;
ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS sales_qty numeric;
