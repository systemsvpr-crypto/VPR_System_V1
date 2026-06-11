-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.users (
  user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  designation text,
  date_of_birth date,
  gender text,
  email text,
  phone_number text,
  current_address text,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text,
  is_active boolean DEFAULT true,
  profile_picture text,
  page_access ARRAY DEFAULT '{}'::text[],
  created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text),
  tab_access jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT users_pkey PRIMARY KEY (user_id)
);
CREATE TABLE public.products (
  product_id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  unit character varying NOT NULL,
  allow_negative_stock boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  product_type character varying DEFAULT ''::character varying,
  CONSTRAINT products_pkey PRIMARY KEY (product_id)
);
CREATE TABLE public.godowns (
  godown_id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  is_active boolean DEFAULT true,
  CONSTRAINT godowns_pkey PRIMARY KEY (godown_id)
);
CREATE TABLE public.transactions (
  txn_id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  godown_id uuid NOT NULL,
  txn_date date NOT NULL CHECK (txn_date <= CURRENT_DATE),
  txn_type USER-DEFINED NOT NULL,
  qty numeric NOT NULL CHECK (qty >= 0::numeric),
  is_void boolean DEFAULT false,
  void_reason character varying,
  ref_txn_id uuid,
  pair_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  back_dated boolean DEFAULT false,
  dispatch_plan_id uuid,
  dispatch_number text,
  CONSTRAINT transactions_pkey PRIMARY KEY (txn_id),
  CONSTRAINT transactions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id),
  CONSTRAINT transactions_godown_id_fkey FOREIGN KEY (godown_id) REFERENCES public.godowns(godown_id),
  CONSTRAINT transactions_ref_txn_id_fkey FOREIGN KEY (ref_txn_id) REFERENCES public.transactions(txn_id),
  CONSTRAINT transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id),
  CONSTRAINT transactions_dispatch_plan_id_fkey FOREIGN KEY (dispatch_plan_id) REFERENCES public.dispatch_plans(plan_id)
);
CREATE TABLE public.daily_snapshots (
  snapshot_date date NOT NULL,
  product_id uuid NOT NULL,
  godown_id uuid NOT NULL,
  closing_stock numeric NOT NULL,
  stale boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT daily_snapshots_pkey PRIMARY KEY (snapshot_date, product_id, godown_id),
  CONSTRAINT daily_snapshots_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id),
  CONSTRAINT daily_snapshots_godown_id_fkey FOREIGN KEY (godown_id) REFERENCES public.godowns(godown_id)
);
CREATE TABLE public.customers (
  customer_id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  phone_number text,
  email text,
  gst_number text,
  crm_follow_up text,
  created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text),
  CONSTRAINT customers_pkey PRIMARY KEY (customer_id)
);
CREATE TABLE public.vendors (
  vendor_id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  phone_number text,
  email text,
  gst_number text,
  created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text),
  CONSTRAINT vendors_pkey PRIMARY KEY (vendor_id)
);
CREATE TABLE public.transporters (
  transporter_id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vehicle_number text,
  driver_phone_number text,
  created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text),
  CONSTRAINT transporters_pkey PRIMARY KEY (transporter_id)
);
CREATE TABLE public.product_groups (
  group_id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT product_groups_pkey PRIMARY KEY (group_id),
  CONSTRAINT product_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.product_group_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  product_id uuid NOT NULL,
  CONSTRAINT product_group_members_pkey PRIMARY KEY (id),
  CONSTRAINT product_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(group_id),
  CONSTRAINT product_group_members_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id)
);
CREATE TABLE public.sales_orders (
  order_id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_date date NOT NULL,
  order_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL,
  total_amount numeric DEFAULT 0,
  is_void boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  process_type text DEFAULT 'order_process'::text,
  CONSTRAINT sales_orders_pkey PRIMARY KEY (order_id),
  CONSTRAINT sales_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id),
  CONSTRAINT sales_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.sales_order_items (
  item_id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  godown_id uuid NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL CHECK (quantity > 0::numeric),
  created_at timestamp with time zone DEFAULT now(),
  cancelled_quantity numeric DEFAULT 0 CHECK (cancelled_quantity >= 0::numeric),
  CONSTRAINT sales_order_items_pkey PRIMARY KEY (item_id),
  CONSTRAINT sales_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.sales_orders(order_id),
  CONSTRAINT sales_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id),
  CONSTRAINT sales_order_items_godown_id_fkey FOREIGN KEY (godown_id) REFERENCES public.godowns(godown_id)
);
CREATE TABLE public.dispatch_plans (
  plan_id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  godown_id uuid,
  unit_price numeric NOT NULL DEFAULT 0,
  is_planned boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  dispatch_date date,
  dispatch_number text,
  dispatch_status text DEFAULT 'Pending'::text,
  created_by uuid,
  inform_after_dispatch text,
  inform_before_dispatch text,
  cancelled_at timestamp with time zone,
  cancelled_reason text,
  cancelled_by uuid,
  CONSTRAINT dispatch_plans_pkey PRIMARY KEY (plan_id),
  CONSTRAINT dispatch_plans_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.sales_order_items(item_id),
  CONSTRAINT dispatch_plans_godown_id_fkey FOREIGN KEY (godown_id) REFERENCES public.godowns(godown_id),
  CONSTRAINT dispatch_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id),
  CONSTRAINT dispatch_plans_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.users(user_id)
);