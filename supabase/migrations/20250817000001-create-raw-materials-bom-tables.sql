-- Create raw materials table
CREATE TABLE raw_materials (
  id SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL,
  code VARCHAR UNIQUE,
  description TEXT,
  base_unit VARCHAR NOT NULL, -- kg, meters, pieces, etc.
  purchase_unit VARCHAR NOT NULL, -- Different unit for purchasing
  conversion_factor DECIMAL NOT NULL DEFAULT 1, -- Factor to convert purchase_unit to base_unit
  cost_per_unit DECIMAL,
  supplier VARCHAR,
  reorder_level DECIMAL DEFAULT 0,
  stock_location VARCHAR,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create BOM headers table
CREATE TABLE bom_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id INTEGER REFERENCES products(id),
  name VARCHAR NOT NULL,
  version VARCHAR DEFAULT '1.0',
  quantity DECIMAL NOT NULL DEFAULT 1, -- Quantity this BOM produces
  unit VARCHAR NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create BOM lines table
CREATE TABLE bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_header_id UUID REFERENCES bom_headers(id) ON DELETE CASCADE,
  raw_material_id INTEGER REFERENCES raw_materials(id),
  quantity DECIMAL NOT NULL,
  unit VARCHAR NOT NULL,
  waste_percentage DECIMAL DEFAULT 0,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create raw material inventory table
CREATE TABLE raw_material_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_material_id INTEGER REFERENCES raw_materials(id),
  quantity_on_hand DECIMAL NOT NULL DEFAULT 0,
  quantity_available DECIMAL NOT NULL DEFAULT 0,
  quantity_reserved DECIMAL NOT NULL DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW(),
  location VARCHAR
);

-- Create indexes for better performance
CREATE INDEX idx_raw_materials_code ON raw_materials(code);
CREATE INDEX idx_raw_materials_active ON raw_materials(active);
CREATE INDEX idx_bom_headers_product_id ON bom_headers(product_id);
CREATE INDEX idx_bom_headers_active ON bom_headers(active);
CREATE INDEX idx_bom_lines_bom_header_id ON bom_lines(bom_header_id);
CREATE INDEX idx_bom_lines_raw_material_id ON bom_lines(raw_material_id);
CREATE INDEX idx_raw_material_inventory_material_id ON raw_material_inventory(raw_material_id);

-- Create trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_raw_materials_updated_at BEFORE UPDATE ON raw_materials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bom_headers_updated_at BEFORE UPDATE ON bom_headers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bom_lines_updated_at BEFORE UPDATE ON bom_lines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample raw materials
INSERT INTO raw_materials (name, code, description, base_unit, purchase_unit, conversion_factor, cost_per_unit, supplier, reorder_level) VALUES
('Cotton Fabric', 'COT001', 'Premium cotton fabric for apparel', 'meters', 'rolls', 50, 2.50, 'Textile Supplier Inc', 100),
('Polyester Thread', 'POL001', 'High-strength polyester thread', 'meters', 'spools', 1000, 0.01, 'Thread Co Ltd', 5000),
('Metal Buttons', 'BUT001', 'Stainless steel buttons 15mm', 'pieces', 'boxes', 100, 0.25, 'Button Factory', 500),
('Elastic Band', 'ELA001', 'Stretch elastic band 20mm', 'meters', 'rolls', 25, 0.15, 'Elastic Solutions', 50),
('Zipper', 'ZIP001', 'Metal zipper 20cm', 'pieces', 'packs', 50, 1.20, 'Zipper World', 200);

-- Create initial inventory records for sample materials
INSERT INTO raw_material_inventory (raw_material_id, quantity_on_hand, quantity_available, location) VALUES
(1, 250, 200, 'Warehouse A'),
(2, 15000, 12000, 'Warehouse A'),
(3, 800, 600, 'Warehouse B'),
(4, 120, 100, 'Warehouse A'),
(5, 350, 300, 'Warehouse B');