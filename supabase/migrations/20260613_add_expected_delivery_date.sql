-- Add expected_delivery_date to purchase_deliveries
ALTER TABLE public.purchase_deliveries ADD COLUMN IF NOT EXISTS expected_delivery_date date;

-- Add delivery_status update timestamp (optional, for tracking when status last changed)
ALTER TABLE public.purchase_deliveries ADD COLUMN IF NOT EXISTS status_updated_at timestamp with time zone;
