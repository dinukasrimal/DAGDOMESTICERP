# Production Planning Database Setup - FIXED VERSION

This document provides step-by-step instructions to set up the database schema for Production Lines, Holidays, and Line Grouping features in your Supabase project.

## 📋 Overview

The production planning system requires 5 main tables:
- `line_groups_production` - Line grouping and organization
- `production_lines_main` - Production line management
- `holidays_main` - Holiday scheduling
- `holiday_line_assignments_main` - Holiday-line relationships
- `planned_orders_main` - Production scheduling

## 🚀 Setup Instructions

### Step 1: Access Supabase SQL Editor

1. Log into your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New Query**

### Step 2: Create All Tables (Copy and Run This Entire Script)

**✅ This script uses unique table names to avoid any conflicts with existing tables.**

```sql
-- Create line_groups_production table (unique name to avoid conflicts)
CREATE TABLE line_groups_production (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    is_expanded BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create production_lines_main table
CREATE TABLE production_lines_main (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 100,
    current_load INTEGER DEFAULT 0,
    efficiency DECIMAL(5,2) DEFAULT 100.00,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'offline')),
    group_id UUID REFERENCES line_groups_production(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create holidays_main table
CREATE TABLE holidays_main (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_global BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create holiday_line_assignments_main table
CREATE TABLE holiday_line_assignments_main (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    holiday_id UUID NOT NULL REFERENCES holidays_main(id) ON DELETE CASCADE,
    line_id UUID NOT NULL REFERENCES production_lines_main(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create planned_orders_main table
CREATE TABLE planned_orders_main (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    po_id VARCHAR(255) NOT NULL,
    line_id UUID NOT NULL REFERENCES production_lines_main(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_line_groups_production_sort_order ON line_groups_production(sort_order);
CREATE INDEX idx_production_lines_main_group_id ON production_lines_main(group_id);
CREATE INDEX idx_production_lines_main_status ON production_lines_main(status);
CREATE INDEX idx_production_lines_main_sort_order ON production_lines_main(sort_order);
CREATE UNIQUE INDEX idx_holidays_main_date_name ON holidays_main(date, name);
CREATE INDEX idx_holidays_main_date ON holidays_main(date);
CREATE INDEX idx_holidays_main_is_global ON holidays_main(is_global);
CREATE UNIQUE INDEX idx_holiday_line_assignments_main_unique ON holiday_line_assignments_main(holiday_id, line_id);
CREATE INDEX idx_holiday_line_assignments_main_holiday_id ON holiday_line_assignments_main(holiday_id);
CREATE INDEX idx_holiday_line_assignments_main_line_id ON holiday_line_assignments_main(line_id);
CREATE INDEX idx_planned_orders_main_po_id ON planned_orders_main(po_id);
CREATE INDEX idx_planned_orders_main_line_id ON planned_orders_main(line_id);
CREATE INDEX idx_planned_orders_main_scheduled_date ON planned_orders_main(scheduled_date);
CREATE INDEX idx_planned_orders_main_status ON planned_orders_main(status);

-- Enable Row Level Security (RLS)
ALTER TABLE line_groups_production ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_lines_main ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays_main ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_line_assignments_main ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_orders_main ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Enable all operations for authenticated users" ON line_groups_production FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all operations for authenticated users" ON production_lines_main FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all operations for authenticated users" ON holidays_main FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all operations for authenticated users" ON holiday_line_assignments_main FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all operations for authenticated users" ON planned_orders_main FOR ALL USING (auth.role() = 'authenticated');

-- Create function for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic updated_at updates
CREATE TRIGGER update_line_groups_production_updated_at BEFORE UPDATE ON line_groups_production FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_production_lines_main_updated_at BEFORE UPDATE ON production_lines_main FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_holidays_main_updated_at BEFORE UPDATE ON holidays_main FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_planned_orders_main_updated_at BEFORE UPDATE ON planned_orders_main FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## 🧪 Testing Your Setup

After running the SQL script above, verify everything worked:

### 1. Check Tables Created
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('line_groups_production', 'production_lines_main', 'holidays_main', 'holiday_line_assignments_main', 'planned_orders_main')
ORDER BY table_name;
```

You should see all 5 tables listed.

### 2. Insert Sample Data
```sql
-- Insert sample data to test
INSERT INTO line_groups_production (name, sort_order) VALUES ('Main Floor', 1);
INSERT INTO production_lines_main (name, capacity, status, sort_order) VALUES ('Assembly Line 1', 100, 'active', 1);
INSERT INTO holidays_main (date, name, is_global) VALUES ('2024-12-25', 'Christmas Day', true);
```

### 3. Verify Sample Data
```sql
SELECT * FROM line_groups_production;
SELECT * FROM production_lines_main;
SELECT * FROM holidays_main;
```

## 📊 Table Structure Reference

### Line Groups (`line_groups_production`)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Group name (e.g., "Floor A") |
| `is_expanded` | BOOLEAN | UI expansion state |
| `sort_order` | INTEGER | Display order |

### Production Lines (`production_lines_main`)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Line name (e.g., "Assembly Line 1") |
| `capacity` | INTEGER | Maximum daily capacity |
| `current_load` | INTEGER | Current workload |
| `efficiency` | DECIMAL(5,2) | Efficiency percentage (0-100) |
| `status` | VARCHAR(20) | active, maintenance, offline |
| `group_id` | UUID | Reference to line_groups_production |
| `sort_order` | INTEGER | Display order |

### Holidays (`holidays_main`)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `date` | DATE | Holiday date |
| `name` | VARCHAR(255) | Holiday name |
| `is_global` | BOOLEAN | Affects all lines if true |

### Holiday Line Assignments (`holiday_line_assignments_main`)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `holiday_id` | UUID | Reference to holidays_main |
| `line_id` | UUID | Reference to production_lines_main |

### Planned Orders (`planned_orders_main`)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `po_id` | VARCHAR(255) | Purchase order reference |
| `line_id` | UUID | Reference to production_lines_main |
| `scheduled_date` | DATE | Production date |
| `quantity` | INTEGER | Planned quantity |
| `status` | VARCHAR(20) | planned, in_progress, completed |

## 🔧 Frontend Integration

After setting up the database, you'll need to update your frontend code to use these table names:

### Example Supabase Query
```typescript
// Fetch production lines with their groups
const { data: productionLines, error } = await supabase
  .from('production_lines_main')
  .select(`
    *,
    line_groups_production (
      id,
      name
    )
  `)
  .order('sort_order');

// Fetch holidays
const { data: holidays, error } = await supabase
  .from('holidays_main')
  .select('*')
  .order('date');

// Fetch line groups
const { data: lineGroups, error } = await supabase
  .from('line_groups_production')
  .select('*')
  .order('sort_order');
```

## ❗ Troubleshooting

### Common Issues:

1. **Authentication Errors:** Make sure you're logged into Supabase and have proper permissions
2. **RLS Errors:** Verify your authentication is working properly
3. **Permission Errors:** Check that RLS policies match your auth setup

### Success Indicators:

✅ All 5 tables created without errors  
✅ Sample data inserts successfully  
✅ Queries return expected results  
✅ No syntax errors in the SQL output  

## 🎉 Next Steps

Once the database is set up successfully:

1. ✅ **Update your frontend TypeScript interfaces** to match the new table names
2. ✅ **Replace Supabase queries** to use the new table names
3. ✅ **Test CRUD operations** from your application
4. ✅ **Add data validation** and error handling
5. ✅ **Test the production planning features** in your UI

---

**Table Names Used:**
- `line_groups_production`
- `production_lines_main` 
- `holidays_main`
- `holiday_line_assignments_main`
- `planned_orders_main`

**Created for:** Flow Planner Production Management System  
**Database:** Supabase PostgreSQL  
**Version:** 2.0 - Fixed  
**Last Updated:** 2025-07-12