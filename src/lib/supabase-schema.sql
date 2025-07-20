-- Production Planning Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Production Lines Table
CREATE TABLE production_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Purchase Orders Table (main purchases)
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number VARCHAR(255) NOT NULL UNIQUE,
  supplier VARCHAR(255) NOT NULL,
  total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
  order_date DATE NOT NULL,
  delivery_date DATE,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'planned', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Purchase Order Lines Table
CREATE TABLE purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  specifications TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Purchase Holds Table
CREATE TABLE purchase_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255)
);

-- Planned Production Table
CREATE TABLE planned_production (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  line_id UUID NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
  planned_date DATE NOT NULL,
  planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
  actual_quantity INTEGER CHECK (actual_quantity >= 0),
  status VARCHAR(50) DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed')),
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(purchase_id, line_id, planned_date, order_index)
);

-- Holidays Table
CREATE TABLE holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(date, name)
);

-- Indexes for performance
CREATE INDEX idx_purchases_status ON purchases(status);
CREATE INDEX idx_purchases_order_date ON purchases(order_date);
CREATE INDEX idx_purchase_order_lines_purchase_id ON purchase_order_lines(purchase_id);
CREATE INDEX idx_purchase_holds_purchase_id ON purchase_holds(purchase_id);
CREATE INDEX idx_planned_production_line_date ON planned_production(line_id, planned_date);
CREATE INDEX idx_planned_production_purchase_id ON planned_production(purchase_id);
CREATE INDEX idx_holidays_date ON holidays(date);

-- Update triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_purchases_updated_at BEFORE UPDATE ON purchases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_production_lines_updated_at BEFORE UPDATE ON production_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_planned_production_updated_at BEFORE UPDATE ON planned_production
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data
INSERT INTO production_lines (name, capacity, description) VALUES
('Line A', 1000, 'Main production line'),
('Line B', 1500, 'High capacity line'),
('Line C', 800, 'Specialized production line');

INSERT INTO holidays (name, date) VALUES
('New Year', '2024-01-01'),
('Christmas', '2024-12-25'),
('Independence Day', '2024-07-04');

-- Sample purchases
INSERT INTO purchases (po_number, supplier, total_quantity, order_date, delivery_date) VALUES
('PO-2024-001', 'Supplier Alpha', 3000, '2024-01-15', '2024-02-15'),
('PO-2024-002', 'Supplier Beta', 4500, '2024-01-20', '2024-02-20'),
('PO-2024-003', 'Supplier Gamma', 2000, '2024-01-25', '2024-02-25');

-- Sample order lines
INSERT INTO purchase_order_lines (purchase_id, product_name, quantity, unit_price, total_price) 
SELECT 
  p.id,
  'Product ' || p.po_number,
  p.total_quantity,
  10.00,
  p.total_quantity * 10.00
FROM purchases p;