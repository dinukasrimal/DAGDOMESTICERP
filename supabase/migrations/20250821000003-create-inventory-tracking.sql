-- Create Raw Material Inventory table for tracking stock levels
CREATE TABLE IF NOT EXISTS raw_material_inventory (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    raw_material_id UUID REFERENCES raw_materials(id) ON DELETE CASCADE UNIQUE,
    quantity DECIMAL(10,3) DEFAULT 0 CHECK (quantity >= 0),
    total_cost DECIMAL(12,2) DEFAULT 0,
    average_cost DECIMAL(10,2) DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create inventory movement history table
CREATE TABLE raw_material_movements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    raw_material_id UUID REFERENCES raw_materials(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('receipt', 'issue', 'adjustment')),
    reference_type VARCHAR(20) CHECK (reference_type IN ('goods_received', 'goods_issue', 'adjustment')),
    reference_id UUID, -- Can reference goods_received.id, goods_issue.id, etc.
    quantity_change DECIMAL(10,3) NOT NULL,
    unit_cost DECIMAL(10,2),
    movement_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    batch_number VARCHAR(100),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_inventory_material ON raw_material_inventory(raw_material_id);
CREATE INDEX idx_movements_material ON raw_material_movements(raw_material_id);
CREATE INDEX idx_movements_type ON raw_material_movements(movement_type);
CREATE INDEX idx_movements_date ON raw_material_movements(movement_date);
CREATE INDEX idx_movements_reference ON raw_material_movements(reference_type, reference_id);

-- Create trigger to update inventory last_updated timestamp
CREATE OR REPLACE FUNCTION update_inventory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_inventory_last_updated 
    BEFORE UPDATE ON raw_material_inventory 
    FOR EACH ROW EXECUTE FUNCTION update_inventory_timestamp();

-- Create function to record inventory movements
CREATE OR REPLACE FUNCTION record_inventory_movement(
    p_raw_material_id UUID,
    p_movement_type VARCHAR(20),
    p_reference_type VARCHAR(20),
    p_reference_id UUID,
    p_quantity_change DECIMAL(10,3),
    p_unit_cost DECIMAL(10,2) DEFAULT NULL,
    p_batch_number VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    movement_id UUID;
    current_user_id UUID;
BEGIN
    -- Get current user
    current_user_id := auth.uid();
    
    -- Insert movement record
    INSERT INTO raw_material_movements (
        raw_material_id,
        movement_type,
        reference_type,
        reference_id,
        quantity_change,
        unit_cost,
        batch_number,
        notes,
        created_by
    ) VALUES (
        p_raw_material_id,
        p_movement_type,
        p_reference_type,
        p_reference_id,
        p_quantity_change,
        p_unit_cost,
        p_batch_number,
        p_notes,
        current_user_id
    ) RETURNING id INTO movement_id;
    
    RETURN movement_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to get current inventory with movement history
CREATE OR REPLACE FUNCTION get_material_inventory_summary(p_raw_material_id UUID)
RETURNS TABLE (
    material_id UUID,
    material_name VARCHAR(255),
    material_code VARCHAR(100),
    current_quantity DECIMAL(10,3),
    total_cost DECIMAL(12,2),
    average_cost DECIMAL(10,2),
    last_updated TIMESTAMP WITH TIME ZONE,
    total_receipts DECIMAL(10,3),
    total_issues DECIMAL(10,3),
    last_receipt_date TIMESTAMP WITH TIME ZONE,
    last_issue_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rm.id as material_id,
        rm.name as material_name,
        rm.code as material_code,
        COALESCE(inv.quantity, 0) as current_quantity,
        COALESCE(inv.total_cost, 0) as total_cost,
        COALESCE(inv.average_cost, 0) as average_cost,
        inv.last_updated,
        COALESCE(receipt_summary.total_receipts, 0) as total_receipts,
        COALESCE(issue_summary.total_issues, 0) as total_issues,
        receipt_summary.last_receipt_date,
        issue_summary.last_issue_date
    FROM raw_materials rm
    LEFT JOIN raw_material_inventory inv ON rm.id = inv.raw_material_id
    LEFT JOIN (
        SELECT 
            raw_material_id,
            SUM(quantity_change) as total_receipts,
            MAX(movement_date) as last_receipt_date
        FROM raw_material_movements 
        WHERE movement_type = 'receipt' 
        GROUP BY raw_material_id
    ) receipt_summary ON rm.id = receipt_summary.raw_material_id
    LEFT JOIN (
        SELECT 
            raw_material_id,
            SUM(ABS(quantity_change)) as total_issues,
            MAX(movement_date) as last_issue_date
        FROM raw_material_movements 
        WHERE movement_type = 'issue' 
        GROUP BY raw_material_id
    ) issue_summary ON rm.id = issue_summary.raw_material_id
    WHERE rm.id = p_raw_material_id;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies
ALTER TABLE raw_material_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory" ON raw_material_inventory FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert inventory" ON raw_material_inventory FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update inventory" ON raw_material_inventory FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can view movements" ON raw_material_movements FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert movements" ON raw_material_movements FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create view for easy inventory reporting
CREATE OR REPLACE VIEW raw_material_inventory_view AS
SELECT 
    rm.id,
    rm.name,
    rm.code,
    rm.base_unit,
    rm.purchase_unit,
    rm.cost_per_unit,
    COALESCE(inv.quantity, 0) as current_quantity,
    COALESCE(inv.total_cost, 0) as total_cost,
    COALESCE(inv.average_cost, 0) as average_cost,
    inv.last_updated,
    rm.reorder_level,
    CASE 
        WHEN COALESCE(inv.quantity, 0) <= COALESCE(rm.reorder_level, 0) THEN 'Low Stock'
        WHEN COALESCE(inv.quantity, 0) = 0 THEN 'Out of Stock'
        ELSE 'In Stock'
    END as stock_status,
    cat.name as category_name,
    sup.name as supplier_name
FROM raw_materials rm
LEFT JOIN raw_material_inventory inv ON rm.id = inv.raw_material_id
LEFT JOIN raw_material_categories cat ON rm.category_id = cat.id
LEFT JOIN suppliers sup ON rm.supplier_id = sup.id
WHERE rm.status = 'active';

-- Grant permissions on the view
GRANT SELECT ON raw_material_inventory_view TO authenticated;