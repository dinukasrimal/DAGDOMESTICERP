-- Create raw material purchase orders tables

-- Purchase orders table
CREATE TABLE raw_material_purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id INTEGER REFERENCES material_suppliers(id) ON DELETE RESTRICT,
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'partial_received', 'received', 'cancelled')),
    total_amount DECIMAL(12,2) DEFAULT 0,
    total_quantity DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase order lines table
CREATE TABLE raw_material_purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID REFERENCES raw_material_purchase_orders(id) ON DELETE CASCADE,
    raw_material_id INTEGER REFERENCES raw_materials(id) ON DELETE RESTRICT,
    quantity DECIMAL(12,2) NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    reference VARCHAR(100),
    received_quantity DECIMAL(12,2) DEFAULT 0 CHECK (received_quantity >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(purchase_order_id, raw_material_id)
);

-- Function to generate PO numbers
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    next_number INTEGER;
    po_number VARCHAR(50);
BEGIN
    -- Get the next sequence number
    SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 'PO-(\d+)') AS INTEGER)), 0) + 1
    INTO next_number
    FROM raw_material_purchase_orders
    WHERE po_number ~ '^PO-\d+$';
    
    -- Format as PO-YYYYMM-NNNN
    po_number := 'PO-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || LPAD(next_number::TEXT, 4, '0');
    
    RETURN po_number;
END;
$$ LANGUAGE plpgsql;

-- Function to update purchase order totals
CREATE OR REPLACE FUNCTION update_purchase_order_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- Update totals when lines are modified
    UPDATE raw_material_purchase_orders 
    SET 
        total_amount = (
            SELECT COALESCE(SUM(total_price), 0) 
            FROM raw_material_purchase_order_lines 
            WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id)
        ),
        total_quantity = (
            SELECT COALESCE(SUM(quantity), 0) 
            FROM raw_material_purchase_order_lines 
            WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id)
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update totals
CREATE TRIGGER trigger_update_po_totals_insert
    AFTER INSERT ON raw_material_purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION update_purchase_order_totals();

CREATE TRIGGER trigger_update_po_totals_update
    AFTER UPDATE ON raw_material_purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION update_purchase_order_totals();

CREATE TRIGGER trigger_update_po_totals_delete
    AFTER DELETE ON raw_material_purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION update_purchase_order_totals();

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_purchase_orders_updated_at
    BEFORE UPDATE ON raw_material_purchase_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_purchase_order_lines_updated_at
    BEFORE UPDATE ON raw_material_purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS Policies
ALTER TABLE raw_material_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material_purchase_order_lines ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage purchase orders
CREATE POLICY "Allow authenticated users to view purchase orders" ON raw_material_purchase_orders
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to create purchase orders" ON raw_material_purchase_orders
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update purchase orders" ON raw_material_purchase_orders
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to delete purchase orders" ON raw_material_purchase_orders
    FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to view purchase order lines" ON raw_material_purchase_order_lines
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to create purchase order lines" ON raw_material_purchase_order_lines
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update purchase order lines" ON raw_material_purchase_order_lines
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to delete purchase order lines" ON raw_material_purchase_order_lines
    FOR DELETE TO authenticated USING (true);

-- Indexes for performance
CREATE INDEX idx_rm_purchase_orders_supplier_id ON raw_material_purchase_orders(supplier_id);
CREATE INDEX idx_rm_purchase_orders_order_date ON raw_material_purchase_orders(order_date);
CREATE INDEX idx_rm_purchase_orders_status ON raw_material_purchase_orders(status);
CREATE INDEX idx_rm_purchase_order_lines_po_id ON raw_material_purchase_order_lines(purchase_order_id);
CREATE INDEX idx_rm_purchase_order_lines_material_id ON raw_material_purchase_order_lines(raw_material_id);