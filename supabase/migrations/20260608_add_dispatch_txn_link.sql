ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS dispatch_plan_id uuid REFERENCES public.dispatch_plans(plan_id);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS dispatch_number text;
CREATE INDEX IF NOT EXISTS idx_transactions_dispatch_plan_id ON public.transactions(dispatch_plan_id);
