
-- Add mo_count column to production_lines table
ALTER TABLE public.production_lines 
ADD COLUMN mo_count integer NOT NULL DEFAULT 0;
