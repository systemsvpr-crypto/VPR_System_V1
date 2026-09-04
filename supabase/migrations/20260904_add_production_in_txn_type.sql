-- Adds PRODUCTION_IN as a new transaction type for the "Production" stock-in
-- action in Stock Management (separate card/entry from Factory Stock In /
-- IN_FACTORY, but the same shape: Product, Godown, Qty, Date).
--
-- This must be applied (and committed) BEFORE
-- 20260904_include_production_in_in_godown_stock.sql runs — Postgres does
-- not allow a newly-added enum value to be referenced in the same
-- transaction it was added in, so these are two separate migration files
-- on purpose; do not merge them into one.
ALTER TYPE public.txn_type ADD VALUE IF NOT EXISTS 'PRODUCTION_IN';
