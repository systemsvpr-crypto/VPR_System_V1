-- Purchase Delivery: record which unit (bag/kg) a dispatch was actually
-- entered in — dispatch_qty_bag/dispatch_qty_kg already store both, but not
-- which one the user picked. received_quantity stays in the product's
-- master unit regardless (converted from this unit by the caller), since
-- that's what drives stock deduction.
ALTER TABLE public.purchase_deliveries ADD COLUMN IF NOT EXISTS dispatch_unit text;
