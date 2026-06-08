ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS process_type text DEFAULT 'order_process';
