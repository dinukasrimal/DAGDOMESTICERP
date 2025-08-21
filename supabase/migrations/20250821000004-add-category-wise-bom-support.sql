-- Add support for category-wise BOMs
-- Add a column to track if a BOM is category-wise
ALTER TABLE bom_headers ADD COLUMN is_category_wise BOOLEAN DEFAULT FALSE;

-- Add a comment to clarify the purpose
COMMENT ON COLUMN bom_headers.is_category_wise IS 'Whether this BOM uses categories instead of specific products';

-- Create an index for better query performance
CREATE INDEX idx_bom_headers_category_wise ON bom_headers(is_category_wise);