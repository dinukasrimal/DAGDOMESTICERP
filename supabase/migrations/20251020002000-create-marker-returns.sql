-- Marker Return tables to track fabric returns against markers
CREATE TABLE IF NOT EXISTS marker_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number VARCHAR(50) UNIQUE NOT NULL,
  marker_id UUID REFERENCES marker_requests(id) ON DELETE RESTRICT,
  purchase_order_id UUID REFERENCES raw_material_purchase_orders(id) ON DELETE SET NULL,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marker_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marker_return_id UUID REFERENCES marker_returns(id) ON DELETE CASCADE,
  raw_material_id INTEGER REFERENCES raw_materials(id) ON DELETE RESTRICT,
  quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(20),
  unit_price DECIMAL(12,2),
  barcodes TEXT[]
);

-- RLS policies
ALTER TABLE marker_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE marker_return_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY marker_returns_select ON marker_returns FOR SELECT TO authenticated USING (true);
CREATE POLICY marker_returns_insert ON marker_returns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY marker_returns_update ON marker_returns FOR UPDATE TO authenticated USING (true);
CREATE POLICY marker_returns_delete ON marker_returns FOR DELETE TO authenticated USING (true);

CREATE POLICY marker_return_lines_select ON marker_return_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY marker_return_lines_insert ON marker_return_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY marker_return_lines_update ON marker_return_lines FOR UPDATE TO authenticated USING (true);
CREATE POLICY marker_return_lines_delete ON marker_return_lines FOR DELETE TO authenticated USING (true);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_marker_returns_marker ON marker_returns(marker_id);
CREATE INDEX IF NOT EXISTS idx_marker_returns_return_number ON marker_returns(return_number);
CREATE INDEX IF NOT EXISTS idx_marker_return_lines_header ON marker_return_lines(marker_return_id);

