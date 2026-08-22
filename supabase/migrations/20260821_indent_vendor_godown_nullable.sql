-- Ultimate IMS's quick "Reorder" action creates an indent straight from the
-- live stock dashboard: just a product + qty + date, nothing else picked yet.
-- Vendor and destination godown for a Process-type indent already get decided
-- later, per item, on the Vendor Approval screen (purchase_indent_items has
-- its own nullable vendor_id / approved_godown_id for exactly that, and every
-- read path already falls back gracefully when they're empty — e.g.
-- VendorSelectionTable.jsx's `item.approved_godown_id || item.purchase_indents?.godown_id`,
-- DeliveryTable.jsx's further fallback to `godowns[0]?.godown_id`, and
-- purchaseService.js's `'Unassigned Vendor'` / `'Unassigned Godown'` labels).
-- The header-level columns just need to allow that same "not decided yet" state.
ALTER TABLE public.purchase_indents
  ALTER COLUMN vendor_id DROP NOT NULL,
  ALTER COLUMN godown_id DROP NOT NULL;
