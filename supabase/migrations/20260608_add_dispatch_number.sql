ALTER TABLE public.dispatch_plans ADD COLUMN IF NOT EXISTS dispatch_number text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_plans_dispatch_number ON public.dispatch_plans(dispatch_number);

ALTER TABLE public.dispatch_plans DROP COLUMN IF EXISTS inform_status;
ALTER TABLE public.dispatch_plans ADD COLUMN IF NOT EXISTS inform_before_dispatch text DEFAULT NULL;

ALTER TABLE public.dispatch_plans ADD COLUMN IF NOT EXISTS dispatch_status text DEFAULT 'Pending';
ALTER TABLE public.dispatch_plans ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(user_id);

ALTER TABLE public.dispatch_plans ADD COLUMN IF NOT EXISTS inform_after_dispatch text DEFAULT NULL;
