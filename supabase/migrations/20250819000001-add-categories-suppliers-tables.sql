-- Create categories lookup table
CREATE TABLE material_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create suppliers lookup table  
CREATE TABLE material_suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL UNIQUE,
  contact_info TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add category_id to raw_materials table
ALTER TABLE raw_materials 
ADD COLUMN category_id INTEGER REFERENCES material_categories(id);

-- Update supplier column to reference suppliers table
ALTER TABLE raw_materials 
ADD COLUMN supplier_id INTEGER REFERENCES material_suppliers(id);

-- Remove stock_location column
ALTER TABLE raw_materials 
DROP COLUMN stock_location;

-- Create indexes
CREATE INDEX idx_material_categories_active ON material_categories(active);
CREATE INDEX idx_material_suppliers_active ON material_suppliers(active);
CREATE INDEX idx_raw_materials_category_id ON raw_materials(category_id);
CREATE INDEX idx_raw_materials_supplier_id ON raw_materials(supplier_id);

-- Create triggers for updated_at
CREATE TRIGGER update_material_categories_updated_at 
  BEFORE UPDATE ON material_categories 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_material_suppliers_updated_at 
  BEFORE UPDATE ON material_suppliers 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some default categories
INSERT INTO material_categories (name, description) VALUES
('Fabrics', 'Textile materials and fabrics'),
('Hardware', 'Metal components, fasteners, and hardware'),
('Threads & Yarns', 'Sewing threads and yarns'),
('Accessories', 'Buttons, zippers, and other accessories'),
('Elastic & Trims', 'Elastic bands, trims, and decorative elements');

-- Insert existing suppliers from raw_materials data
INSERT INTO material_suppliers (name) 
SELECT DISTINCT supplier 
FROM raw_materials 
WHERE supplier IS NOT NULL AND supplier != '';

-- Update raw_materials to reference the new supplier records
UPDATE raw_materials 
SET supplier_id = material_suppliers.id
FROM material_suppliers 
WHERE raw_materials.supplier = material_suppliers.name;

-- Update raw_materials with appropriate categories based on existing data
UPDATE raw_materials SET category_id = 1 WHERE name LIKE '%Fabric%' OR name LIKE '%Cotton%';
UPDATE raw_materials SET category_id = 2 WHERE name LIKE '%Button%' OR name LIKE '%Metal%';
UPDATE raw_materials SET category_id = 3 WHERE name LIKE '%Thread%';
UPDATE raw_materials SET category_id = 4 WHERE name LIKE '%Zipper%';
UPDATE raw_materials SET category_id = 5 WHERE name LIKE '%Elastic%';

-- Drop the old supplier column after migration
ALTER TABLE raw_materials 
DROP COLUMN supplier;