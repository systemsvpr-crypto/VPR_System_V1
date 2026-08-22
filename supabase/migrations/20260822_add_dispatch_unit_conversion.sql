-- Track the unit a dispatch was actually recorded in (bag/kg), and the
-- quantity converted back into the product's master unit — the value that
-- drives stock deduction and pending-qty math regardless of entry unit.
-- Columns were added manually via the Supabase table editor as
-- convert_unit / converted_value — this migration documents that state and
-- backfills existing rows for anyone re-running it against a fresh DB.
ALTER TABLE public.dispatch_plans ADD COLUMN IF NOT EXISTS convert_unit text;
ALTER TABLE public.dispatch_plans ADD COLUMN IF NOT EXISTS converted_value numeric;

-- Backfill existing rows: they predate unit conversion, so their recorded
-- quantity already IS the master-unit quantity.
UPDATE public.dispatch_plans SET converted_value = quantity WHERE converted_value IS NULL;
