-- Issue Returns (returns from store/issues)
CREATE TABLE IF NOT EXISTS issue_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number VARCHAR(50) UNIQUE NOT NULL,
  return_type VARCHAR(20) NOT NULL CHECK (return_type IN ('trims', 'cut')),
  supplier_id INTEGER REFERENCES material_suppliers(id) ON DELETE SET NULL,
  po_id UUID REFERENCES raw_material_purchase_orders(id) ON DELETE SET NULL,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS issue_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_return_id UUID REFERENCES issue_returns(id) ON DELETE CASCADE,
  goods_issue_line_id UUID REFERENCES goods_issue_lines(id) ON DELETE SET NULL,
  cut_issue_record_id UUID REFERENCES cut_issue_records(id) ON DELETE SET NULL,
  raw_material_id INTEGER REFERENCES raw_materials(id) ON DELETE SET NULL,
  quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  counts_inventory BOOLEAN DEFAULT false
);

ALTER TABLE issue_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_return_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY issue_returns_select ON issue_returns FOR SELECT TO authenticated USING (true);
CREATE POLICY issue_returns_insert ON issue_returns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY issue_returns_update ON issue_returns FOR UPDATE TO authenticated USING (true);
CREATE POLICY issue_returns_delete ON issue_returns FOR DELETE TO authenticated USING (true);

CREATE POLICY issue_return_lines_select ON issue_return_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY issue_return_lines_insert ON issue_return_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY issue_return_lines_update ON issue_return_lines FOR UPDATE TO authenticated USING (true);
CREATE POLICY issue_return_lines_delete ON issue_return_lines FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_issue_returns_type ON issue_returns(return_type);
CREATE INDEX IF NOT EXISTS idx_issue_returns_po ON issue_returns(po_id);
CREATE INDEX IF NOT EXISTS idx_issue_return_lines_header ON issue_return_lines(issue_return_id);

