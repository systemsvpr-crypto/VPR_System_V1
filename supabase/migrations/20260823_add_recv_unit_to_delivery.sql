-- Aawak Details: record which unit (bag/kg) the received qty was actually
-- entered in, and the raw as-typed figure in that unit. received_quantity
-- stays in the product's master unit regardless (converted from this unit
-- by the caller), since that's what drives stock in.
ALTER TABLE public.purchase_deliveries ADD COLUMN IF NOT EXISTS recv_unit text;
ALTER TABLE public.purchase_deliveries ADD COLUMN IF NOT EXISTS recv_unit_qty numeric;
