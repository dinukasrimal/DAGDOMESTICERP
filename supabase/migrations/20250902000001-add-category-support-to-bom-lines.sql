-- Add category support to bom_lines for category-wise consumption
-- This allows BOM lines to reference material categories instead of specific materials

-- Add category_id column to bom_lines table
ALTER TABLE bom_lines 
ADD COLUMN category_id INTEGER REFERENCES material_categories(id);

-- Create index for better query performance
CREATE INDEX idx_bom_lines_category_id ON bom_lines(category_id);

-- Update the constraint to allow either raw_material_id OR category_id (but not both)
-- For category-wise consumption, raw_material_id will be NULL and category_id will be set
-- For direct material consumption, category_id will be NULL and raw_material_id will be set

-- Add a check constraint to ensure exactly one of raw_material_id or category_id is set
ALTER TABLE bom_lines 
ADD CONSTRAINT check_material_or_category 
CHECK (
  (raw_material_id IS NOT NULL AND category_id IS NULL) OR 
  (raw_material_id IS NULL AND category_id IS NOT NULL)
);

-- Add RLS policy for the new column
-- (Assuming RLS is already enabled on bom_lines table)

-- Comment to explain the usage
COMMENT ON COLUMN bom_lines.category_id IS 'Reference to material category for category-wise consumption BOMs. Mutually exclusive with raw_material_id.';