ALTER TABLE public.purchase_indents ADD COLUMN IF NOT EXISTS process_type text DEFAULT 'process';
