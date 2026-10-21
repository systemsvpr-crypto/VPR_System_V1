-- Migration: Add separate admin_remark column to checklist, delegation, and delegation_done tables
-- Purpose: Keep admin remark (approval/rejection) completely separate from user remark (submission).

ALTER TABLE public.checklist
  ADD COLUMN IF NOT EXISTS admin_remark text;

ALTER TABLE public.delegation
  ADD COLUMN IF NOT EXISTS admin_remark text;

ALTER TABLE public.delegation_done
  ADD COLUMN IF NOT EXISTS admin_remark text;

-- Optional: populate admin_remark from existing rejection_reason where applicable
UPDATE public.checklist
SET admin_remark = rejection_reason
WHERE rejection_reason IS NOT NULL AND admin_remark IS NULL;

UPDATE public.delegation
SET admin_remark = rejection_reason
WHERE rejection_reason IS NOT NULL AND admin_remark IS NULL;

UPDATE public.delegation_done
SET admin_remark = rejection_reason
WHERE rejection_reason IS NOT NULL AND admin_remark IS NULL;
