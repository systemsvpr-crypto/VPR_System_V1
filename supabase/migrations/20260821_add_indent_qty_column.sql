-- purchase_indent_items.quantity gets overwritten with the Approved Qty once
-- Vendor Selection/Approval saves (see updateVendorSelection / approveIndentItem
-- in purchaseService.js), which silently lost the originally-requested Indent
-- Qty. indent_qty is a separate, never-overwritten-after-creation column that
-- always holds what was actually indented, so "Indent Qty" can keep showing
-- that instead of whatever the approved quantity later became.
ALTER TABLE public.purchase_indent_items
  ADD COLUMN IF NOT EXISTS indent_qty numeric;

-- Backfill existing rows — quantity is the best available value for rows
-- created before this column existed (it just may already reflect an
-- approved qty rather than the original ask, for anything already approved).
UPDATE public.purchase_indent_items
  SET indent_qty = quantity
  WHERE indent_qty IS NULL;
