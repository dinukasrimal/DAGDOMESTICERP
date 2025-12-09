-- Purpose: allow purchase line IDs sourced from Odoo (integers) without UUID cast errors
-- Converts purchase_lines.id from uuid to text and preserves existing values.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_lines'
      AND column_name = 'id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.purchase_lines
      ALTER COLUMN id DROP DEFAULT;

    ALTER TABLE public.purchase_lines
      ALTER COLUMN id TYPE text USING id::text;

    ALTER TABLE public.purchase_lines
      ALTER COLUMN id SET NOT NULL;
  END IF;
END $$;

-- Keep primary key constraint but re-establish a default for convenience
ALTER TABLE public.purchase_lines
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
