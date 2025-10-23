-- Supplier Returns header and lines
CREATE TABLE IF NOT EXISTS supplier_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number VARCHAR(50) UNIQUE NOT NULL,
  po_id UUID REFERENCES raw_material_purchase_orders(id) ON DELETE RESTRICT,
  supplier_id INTEGER REFERENCES material_suppliers(id) ON DELETE RESTRICT,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_return_id UUID REFERENCES supplier_returns(id) ON DELETE CASCADE,
  raw_material_id INTEGER REFERENCES raw_materials(id) ON DELETE RESTRICT,
  quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(20),
  unit_price DECIMAL(12,2),
  barcodes TEXT[]
);

-- RLS
ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_return_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_returns_sel ON supplier_returns FOR SELECT TO authenticated USING (true);
CREATE POLICY supplier_returns_ins ON supplier_returns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY supplier_returns_upd ON supplier_returns FOR UPDATE TO authenticated USING (true);
CREATE POLICY supplier_returns_del ON supplier_returns FOR DELETE TO authenticated USING (true);

CREATE POLICY supplier_return_lines_sel ON supplier_return_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY supplier_return_lines_ins ON supplier_return_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY supplier_return_lines_upd ON supplier_return_lines FOR UPDATE TO authenticated USING (true);
CREATE POLICY supplier_return_lines_del ON supplier_return_lines FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_supplier_returns_po ON supplier_returns(po_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_number ON supplier_returns(return_number);
CREATE INDEX IF NOT EXISTS idx_supplier_return_lines_header ON supplier_return_lines(supplier_return_id);

