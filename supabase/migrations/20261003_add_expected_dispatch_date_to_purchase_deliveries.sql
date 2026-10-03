-- Delivery tab's "Expected Dispatch Date". Picked on the Pending sub-tab and
-- auto-saved straight onto the indent item (no Submit needed); copied onto
-- the lift when it's submitted, editable afterwards from History.
ALTER TABLE public.purchase_indent_items
  ADD COLUMN IF NOT EXISTS expected_dispatch_date date;

ALTER TABLE public.purchase_deliveries
  ADD COLUMN IF NOT EXISTS expected_dispatch_date date;
