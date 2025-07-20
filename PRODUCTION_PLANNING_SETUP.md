# Production Planning Database Setup

This document provides step-by-step instructions to set up the database schema for Production Lines, Holidays, and Line Grouping features in your Supabase project.

## 📋 Overview

The production planning system requires 5 main tables:
- `production_lines` - Production line management
- `line_groups` - Line grouping and organization
- `holidays` - Holiday scheduling
- `holiday_line_assignments` - Holiday-line relationships
- `planned_orders` - Production scheduling

## 🚀 Setup Instructions

### Step 1: Access Supabase SQL Editor

1. Log into your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New Query**

### Step 2: Create Tables in Order

**⚠️ Important:** Run these SQL commands in the exact order shown below due to foreign key dependencies.

#### 2.1 Create Line Groups Table

```sql
-- Create line_groups table
CREATE TABLE line_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    is_expanded BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for sorting
CREATE INDEX idx_line_groups_sort_order ON line_groups(sort_order);
```

#### 2.2 Create Production Lines Table

```sql
-- Create production_lines table
r better performance
CREATE INDEX idx_production_lines_group_id ON production_lines(group_id);
CREATE INDEX CREATE TABLE production_lines (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 100,
    current_load INTEGER DEFAULT 0,
    efficiency DECIMAL(5,2) DEFAULT 100.00,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'offline')),
    group_id UUID REFERENCES line_groups(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes foidx_production_lines_status ON production_lines(status);
CREATE INDEX idx_production_lines_sort_order ON production_lines(sort_order);
```

#### 2.3 Create Holidays Table

```sql
-- Create holidays table
CREATE TABLE holidays (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_global BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraint to prevent duplicate holidays on same date
CREATE UNIQUE INDEX idx_holidays_date_name ON holidays(date, name);
CREATE INDEX idx_holidays_date ON holidays(date);
CREATE INDEX idx_holidays_is_global ON holidays(is_global);
```

#### 2.4 Create Holiday Line Assignments Table

```sql
-- Create holiday_line_assignments table (for non-global holidays)
CREATE TABLE holiday_line_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    holiday_id UUID NOT NULL REFERENCES holidays(id) ON DELETE CASCADE,
    line_id UUID NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique constraint to prevent duplicate assignments
CREATE UNIQUE INDEX idx_holiday_line_assignments_unique ON holiday_line_assignments(holiday_id, line_id);
CREATE INDEX idx_holiday_line_assignments_holiday_id ON holiday_line_assignments(holiday_id);
CREATE INDEX idx_holiday_line_assignments_line_id ON holiday_line_assignments(line_id);
```

#### 2.5 Create Planned Orders Table

```sql
-- Create planned_orders table
CREATE TABLE planned_orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    po_id VARCHAR(255) NOT NULL, -- References purchase order name/number
    line_id UUID NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_planned_orders_po_id ON planned_orders(po_id);
CREATE INDEX idx_planned_orders_line_id ON planned_orders(line_id);
CREATE INDEX idx_planned_orders_scheduled_date ON planned_orders(scheduled_date);
CREATE INDEX idx_planned_orders_status ON planned_orders(status);
```

### Step 3: Set Up Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE production_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_line_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_orders ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Enable all operations for authenticated users" ON production_lines
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all operations for authenticated users" ON line_groups
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all operations for authenticated users" ON holidays
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all operations for authenticated users" ON holiday_line_assignments
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all operations for authenticated users" ON planned_orders
    FOR ALL USING (auth.role() = 'authenticated');
```

### Step 4: Add Automatic Timestamp Updates (Optional)

```sql
-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic updated_at updates
CREATE TRIGGER update_production_lines_updated_at BEFORE UPDATE ON production_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_line_groups_updated_at BEFORE UPDATE ON line_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_holidays_updated_at BEFORE UPDATE ON holidays
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_planned_orders_updated_at BEFORE UPDATE ON planned_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## 📊 Table Structure Reference

### Production Lines (`production_lines`)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Line name (e.g., "Assembly Line 1") |
| `capacity` | INTEGER | Maximum daily capacity |
| `current_load` | INTEGER | Current workload |
| `efficiency` | DECIMAL(5,2) | Efficiency percentage (0-100) |
| `status` | VARCHAR(20) | active, maintenance, offline |
| `group_id` | UUID | Reference to line_groups |
| `sort_order` | INTEGER | Display order |

### Line Groups (`line_groups`)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Group name (e.g., "Floor A") |
| `is_expanded` | BOOLEAN | UI expansion state |
| `sort_order` | INTEGER | Display order |

### Holidays (`holidays`)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `date` | DATE | Holiday date |
| `name` | VARCHAR(255) | Holiday name |
| `is_global` | BOOLEAN | Affects all lines if true |

### Holiday Line Assignments (`holiday_line_assignments`)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `holiday_id` | UUID | Reference to holidays |
| `line_id` | UUID | Reference to production_lines |

### Planned Orders (`planned_orders`)
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `po_id` | VARCHAR(255) | Purchase order reference |
| `line_id` | UUID | Reference to production_lines |
| `scheduled_date` | DATE | Production date |
| `quantity` | INTEGER | Planned quantity |
| `status` | VARCHAR(20) | planned, in_progress, completed |

## 🧪 Testing Your Setup

After running all the SQL commands, verify your setup:

1. **Check Tables Created:**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('production_lines', 'line_groups', 'holidays', 'holiday_line_assignments', 'planned_orders');
   ```

2. **Insert Sample Data:**
   ```sql
   -- Insert a sample line group
   INSERT INTO line_groups (name, sort_order) VALUES ('Main Floor', 1);
   
   -- Insert a sample production line
   INSERT INTO production_lines (name, capacity, status, sort_order) 
   VALUES ('Assembly Line 1', 100, 'active', 1);
   
   -- Insert a sample holiday
   INSERT INTO holidays (date, name, is_global) 
   VALUES ('2024-12-25', 'Christmas Day', true);
   ```

3. **Verify Sample Data:**
   ```sql
   SELECT * FROM line_groups;
   SELECT * FROM production_lines;
   SELECT * FROM holidays;
   ```

## 🔧 Frontend Integration

After setting up the database, you'll need to update your frontend code to:

1. **Add Supabase queries** for CRUD operations
2. **Replace local state** with database calls
3. **Add error handling** for database operations
4. **Implement data synchronization**

Example Supabase query for fetching production lines:
```typescript
const { data: productionLines, error } = await supabase
  .from('production_lines')
  .select(`
    *,
    line_groups (
      id,
      name
    )
  `)
  .order('sort_order');
```

## ❗ Troubleshooting

### Common Issues:

1. **Foreign Key Errors:** Ensure tables are created in the correct order
2. **RLS Errors:** Make sure your authentication is working properly
3. **Permission Errors:** Verify RLS policies match your auth setup

### Need Help?

- Check the Supabase logs in the Dashboard
- Review the SQL error messages
- Ensure proper authentication setup

## 🎉 Next Steps

Once the database is set up:

1. ✅ Test all tables are created
2. ✅ Verify RLS policies work
3. ✅ Update frontend code to use Supabase
4. ✅ Test CRUD operations from the UI
5. ✅ Add data validation and error handling

---

**Created for:** Flow Planner Production Management System  
**Database:** Supabase PostgreSQL  
**Version:** 1.0  
**Last Updated:** 2025-07-12