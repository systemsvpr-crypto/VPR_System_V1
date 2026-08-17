-- Tracks who approved each indent item, for the "Approved By" column on the
-- Purchase Dashboard. Direct-type items are auto-approved by their creator;
-- Process-type items are approved by whoever actions them on Vendor Approval.
ALTER TABLE public.purchase_indent_items
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users(user_id);
