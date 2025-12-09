-- Ensure purchases table has updated_at column required by BOM triggers
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill nulls in case the column existed without a default
UPDATE public.purchases
SET updated_at = COALESCE(updated_at, now());
