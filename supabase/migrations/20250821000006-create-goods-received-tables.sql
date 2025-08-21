-- Create goods received tables for raw material purchase orders

-- Goods received table
CREATE TABLE goods_received (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grn_number VARCHAR(50) UNIQUE NOT NULL,
    purchase_order_id UUID REFERENCES raw_material_purchase_orders(id) ON DELETE RESTRICT,
    received_date DATE NOT NULL,
    received_by UUID REFERENCES auth.users(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'posted')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Goods received lines table
CREATE TABLE goods_received_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goods_received_id UUID REFERENCES goods_received(id) ON DELETE CASCADE,
    purchase_order_line_id UUID REFERENCES raw_material_purchase_order_lines(id) ON DELETE RESTRICT,
    raw_material_id INTEGER REFERENCES raw_materials(id) ON DELETE RESTRICT,
    quantity_received DECIMAL(12,2) NOT NULL CHECK (quantity_received > 0),
    unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    batch_number VARCHAR(50),
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to generate GRN numbers
CREATE OR REPLACE FUNCTION generate_grn_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    next_number INTEGER;
    result_grn_number VARCHAR(50);
BEGIN
    -- Get the next sequence number for current month
    SELECT COALESCE(MAX(CAST(SUBSTRING(goods_received.grn_number FROM 'GRN-\\d{6}-(\\d+)') AS INTEGER)), 0) + 1
    INTO next_number
    FROM goods_received
    WHERE goods_received.grn_number ~ ('^GRN-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-\\d+$');
    
    -- Format as GRN-YYYYMM-NNNN
    result_grn_number := 'GRN-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || LPAD(next_number::TEXT, 4, '0');
    
    RETURN result_grn_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamps
CREATE TRIGGER trigger_update_goods_received_updated_at
    BEFORE UPDATE ON goods_received
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_goods_received_lines_updated_at
    BEFORE UPDATE ON goods_received_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS Policies
ALTER TABLE goods_received ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_received_lines ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage goods received
CREATE POLICY "Allow authenticated users to view goods received" ON goods_received
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to create goods received" ON goods_received
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update goods received" ON goods_received
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to delete goods received" ON goods_received
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to view goods received lines" ON goods_received_lines
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to create goods received lines" ON goods_received_lines
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update goods received lines" ON goods_received_lines
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to delete goods received lines" ON goods_received_lines
    FOR DELETE TO authenticated USING (true);

-- Indexes for performance
CREATE INDEX idx_goods_received_purchase_order_id ON goods_received(purchase_order_id);
CREATE INDEX idx_goods_received_received_date ON goods_received(received_date);
CREATE INDEX idx_goods_received_status ON goods_received(status);
CREATE INDEX idx_goods_received_lines_grn_id ON goods_received_lines(goods_received_id);
CREATE INDEX idx_goods_received_lines_po_line_id ON goods_received_lines(purchase_order_line_id);
CREATE INDEX idx_goods_received_lines_material_id ON goods_received_lines(raw_material_id);