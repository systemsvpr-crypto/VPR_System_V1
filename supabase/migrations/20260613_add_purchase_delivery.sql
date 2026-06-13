-- Add PURCHASE_IN to the txn_type enum used by transactions table
DO $$
DECLARE
  type_name text;
BEGIN
  SELECT t.typname INTO type_name
  FROM pg_type t
  JOIN pg_catalog.pg_attribute a ON a.atttypid = t.oid
  WHERE a.attrelid = 'transactions'::regclass
    AND a.attname = 'txn_type'
    AND t.typtype = 'e';

  IF type_name IS NULL THEN
    RAISE EXCEPTION 'Could not find enum type for transactions.txn_type';
  END IF;

  EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS ''PURCHASE_IN''', type_name);
END $$;

-- Add LR Number and Vehicle Number columns to transactions for purchase tracking
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS lr_number text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS vehicle_number text;

-- Create purchase_deliveries table
CREATE TABLE IF NOT EXISTS public.purchase_deliveries (
  delivery_id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.purchase_indent_items(item_id),
  indent_id uuid NOT NULL REFERENCES public.purchase_indents(indent_id),
  delivery_date date NOT NULL,
  received_quantity numeric(15,2) NOT NULL CHECK (received_quantity > 0),
  transporter_id uuid REFERENCES public.transporters(transporter_id),
  lr_number text,
  vehicle_number text,
  lifting_number text,
  remarks text,
  created_by uuid REFERENCES public.users(user_id),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT purchase_deliveries_pkey PRIMARY KEY (delivery_id)
);

-- Add lifting_number column to transactions for purchase tracking
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS lifting_number text;

-- Add status column to purchase_deliveries (Pending / Received)
ALTER TABLE public.purchase_deliveries ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Received';

-- Multi-godown support for purchase deliveries
CREATE TABLE IF NOT EXISTS public.purchase_delivery_godowns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.purchase_deliveries(delivery_id) ON DELETE CASCADE,
  godown_id uuid NOT NULL REFERENCES public.godowns(godown_id),
  qty numeric(15,2) NOT NULL CHECK (qty > 0),
  CONSTRAINT purchase_delivery_godowns_pkey PRIMARY KEY (id)
);
