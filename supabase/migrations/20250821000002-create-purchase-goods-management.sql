-- Create Purchase Orders table
CREATE TABLE purchase_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'sent', 'partial_received', 'received', 'cancelled')),
    total_amount DECIMAL(12,2),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Purchase Order Lines table
CREATE TABLE purchase_order_lines (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
    raw_material_id UUID REFERENCES raw_materials(id) ON DELETE RESTRICT,
    quantity DECIMAL(10,3) NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    received_quantity DECIMAL(10,3) DEFAULT 0 CHECK (received_quantity >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Goods Received table
CREATE TABLE goods_received (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    grn_number VARCHAR(50) UNIQUE NOT NULL,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    received_by UUID REFERENCES auth.users(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'posted')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Goods Received Lines table
CREATE TABLE goods_received_lines (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    goods_received_id UUID REFERENCES goods_received(id) ON DELETE CASCADE,
    purchase_order_line_id UUID REFERENCES purchase_order_lines(id) ON DELETE RESTRICT,
    raw_material_id UUID REFERENCES raw_materials(id) ON DELETE RESTRICT,
    quantity_received DECIMAL(10,3) NOT NULL CHECK (quantity_received > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    batch_number VARCHAR(100),
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Goods Issue table
CREATE TABLE goods_issue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    issue_number VARCHAR(50) UNIQUE NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    issued_by UUID REFERENCES auth.users(id),
    issue_type VARCHAR(20) DEFAULT 'production' CHECK (issue_type IN ('production', 'maintenance', 'sample', 'waste', 'adjustment')),
    reference_number VARCHAR(100), -- Could be production order number, etc.
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Goods Issue Lines table
CREATE TABLE goods_issue_lines (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    goods_issue_id UUID REFERENCES goods_issue(id) ON DELETE CASCADE,
    raw_material_id UUID REFERENCES raw_materials(id) ON DELETE RESTRICT,
    quantity_issued DECIMAL(10,3) NOT NULL CHECK (quantity_issued > 0),
    unit_cost DECIMAL(10,2),
    batch_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_purchase_orders_updated_at 
    BEFORE UPDATE ON purchase_orders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchase_order_lines_updated_at 
    BEFORE UPDATE ON purchase_order_lines 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_goods_received_updated_at 
    BEFORE UPDATE ON goods_received 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_goods_issue_updated_at 
    BEFORE UPDATE ON goods_issue 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_date ON purchase_orders(order_date);
CREATE INDEX idx_purchase_order_lines_po ON purchase_order_lines(purchase_order_id);
CREATE INDEX idx_purchase_order_lines_material ON purchase_order_lines(raw_material_id);
CREATE INDEX idx_goods_received_po ON goods_received(purchase_order_id);
CREATE INDEX idx_goods_received_date ON goods_received(received_date);
CREATE INDEX idx_goods_received_lines_grn ON goods_received_lines(goods_received_id);
CREATE INDEX idx_goods_received_lines_po_line ON goods_received_lines(purchase_order_line_id);
CREATE INDEX idx_goods_issue_date ON goods_issue(issue_date);
CREATE INDEX idx_goods_issue_type ON goods_issue(issue_type);
CREATE INDEX idx_goods_issue_lines_issue ON goods_issue_lines(goods_issue_id);
CREATE INDEX idx_goods_issue_lines_material ON goods_issue_lines(raw_material_id);

-- Create functions to auto-generate numbers
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
    po_number TEXT;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 3) AS INTEGER)), 0) + 1
    INTO next_num
    FROM purchase_orders
    WHERE po_number ~ '^PO[0-9]+$';
    
    po_number := 'PO' || LPAD(next_num::TEXT, 6, '0');
    RETURN po_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_grn_number()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
    grn_number TEXT;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(grn_number FROM 4) AS INTEGER)), 0) + 1
    INTO next_num
    FROM goods_received
    WHERE grn_number ~ '^GRN[0-9]+$';
    
    grn_number := 'GRN' || LPAD(next_num::TEXT, 6, '0');
    RETURN grn_number;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_issue_number()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
    issue_number TEXT;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(issue_number FROM 3) AS INTEGER)), 0) + 1
    INTO next_num
    FROM goods_issue
    WHERE issue_number ~ '^GI[0-9]+$';
    
    issue_number := 'GI' || LPAD(next_num::TEXT, 6, '0');
    RETURN issue_number;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies (assuming profiles table exists with role-based access)
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_received ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_received_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_issue ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_issue_lines ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (can be customized based on business requirements)
CREATE POLICY "Users can view purchase orders" ON purchase_orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert purchase orders" ON purchase_orders FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update purchase orders" ON purchase_orders FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view purchase order lines" ON purchase_order_lines FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert purchase order lines" ON purchase_order_lines FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update purchase order lines" ON purchase_order_lines FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view goods received" ON goods_received FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert goods received" ON goods_received FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update goods received" ON goods_received FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view goods received lines" ON goods_received_lines FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert goods received lines" ON goods_received_lines FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can view goods issue" ON goods_issue FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert goods issue" ON goods_issue FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update goods issue" ON goods_issue FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view goods issue lines" ON goods_issue_lines FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert goods issue lines" ON goods_issue_lines FOR INSERT WITH CHECK (auth.role() = 'authenticated');