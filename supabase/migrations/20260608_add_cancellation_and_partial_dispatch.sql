-- Drop UNIQUE constraint on dispatch_plans.order_item_id to allow multiple dispatch plans per order item
ALTER TABLE public.dispatch_plans DROP CONSTRAINT IF EXISTS dispatch_plans_order_item_id_key;

-- Track cancelled quantity on each order item
ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS cancelled_quantity numeric DEFAULT 0;
ALTER TABLE public.sales_order_items
  DROP CONSTRAINT IF EXISTS chk_cancelled_gt_zero;
ALTER TABLE public.sales_order_items
  ADD CONSTRAINT chk_cancelled_gt_zero CHECK (cancelled_quantity >= 0);

-- Track cancellation on dispatch plans
ALTER TABLE public.dispatch_plans
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;
ALTER TABLE public.dispatch_plans
  ADD COLUMN IF NOT EXISTS cancelled_reason text;
ALTER TABLE public.dispatch_plans
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.users(user_id);
