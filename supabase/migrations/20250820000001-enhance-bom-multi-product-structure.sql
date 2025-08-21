-- Enhanced BOM structure for multi-product BOMs with size/color consumption

-- Update BOM headers to support multi-product BOMs
ALTER TABLE bom_headers 
DROP COLUMN product_id,
ADD COLUMN product_ids integer[] DEFAULT '{}',
ADD COLUMN bom_type varchar(20) DEFAULT 'single' CHECK (bom_type IN ('single', 'multi')),
ADD COLUMN description text;

-- Create BOM product assignments table
CREATE TABLE bom_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_header_id uuid REFERENCES bom_headers(id) ON DELETE CASCADE,
  product_id integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_bom_products_bom_header_id ON bom_products(bom_header_id);
CREATE INDEX idx_bom_products_product_id ON bom_products(product_id);

-- Enhanced BOM lines to support consumption types
ALTER TABLE bom_lines 
ADD COLUMN consumption_type varchar(20) DEFAULT 'general' CHECK (consumption_type IN ('general', 'size_wise', 'color_wise')),
ADD COLUMN size_consumptions jsonb DEFAULT '{}',
ADD COLUMN color_consumptions jsonb DEFAULT '{}';

-- Create BOM line consumption details table for better normalization
CREATE TABLE bom_line_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_line_id uuid REFERENCES bom_lines(id) ON DELETE CASCADE,
  attribute_type varchar(20) NOT NULL CHECK (attribute_type IN ('size', 'color', 'general')),
  attribute_value varchar(100) NOT NULL, -- size value, color value, or 'general'
  quantity numeric(10,4) NOT NULL,
  unit varchar(50) NOT NULL,
  waste_percentage numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(bom_line_id, attribute_type, attribute_value)
);

-- Create indexes
CREATE INDEX idx_bom_line_consumptions_bom_line_id ON bom_line_consumptions(bom_line_id);
CREATE INDEX idx_bom_line_consumptions_attribute ON bom_line_consumptions(attribute_type, attribute_value);

-- Add functions to get unique colors and sizes for products
CREATE OR REPLACE FUNCTION get_unique_colors_for_products(product_ids integer[])
RETURNS text[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT DISTINCT colour 
    FROM products 
    WHERE id = ANY(product_ids) 
    AND colour IS NOT NULL 
    AND colour != ''
    ORDER BY colour
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_unique_sizes_for_products(product_ids integer[])
RETURNS text[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT DISTINCT size 
    FROM products 
    WHERE id = ANY(product_ids) 
    AND size IS NOT NULL 
    AND size != ''
    ORDER BY size
  );
END;
$$ LANGUAGE plpgsql;

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bom_products_updated_at BEFORE UPDATE ON bom_products FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_bom_line_consumptions_updated_at BEFORE UPDATE ON bom_line_consumptions FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Add RLS policies
ALTER TABLE bom_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_line_consumptions ENABLE ROW LEVEL SECURITY;

-- Policies for bom_products
CREATE POLICY "Users can view bom_products" ON bom_products FOR SELECT USING (true);
CREATE POLICY "Users can insert bom_products" ON bom_products FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update bom_products" ON bom_products FOR UPDATE USING (true);
CREATE POLICY "Users can delete bom_products" ON bom_products FOR DELETE USING (true);

-- Policies for bom_line_consumptions  
CREATE POLICY "Users can view bom_line_consumptions" ON bom_line_consumptions FOR SELECT USING (true);
CREATE POLICY "Users can insert bom_line_consumptions" ON bom_line_consumptions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update bom_line_consumptions" ON bom_line_consumptions FOR UPDATE USING (true);
CREATE POLICY "Users can delete bom_line_consumptions" ON bom_line_consumptions FOR DELETE USING (true);