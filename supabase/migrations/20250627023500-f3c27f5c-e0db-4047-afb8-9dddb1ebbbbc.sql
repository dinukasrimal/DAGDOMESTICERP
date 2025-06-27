
-- Add missing columns to inventory table for better tracking
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS virtual_available numeric DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS reorder_max numeric DEFAULT 0;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS location text DEFAULT 'WH/Stock';

-- Add supplier tracking to purchases table  
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS received_qty numeric DEFAULT 0;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS pending_qty numeric DEFAULT 0;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS expected_date date;

-- Create purchase order lines table for detailed tracking
CREATE TABLE IF NOT EXISTS public.purchase_lines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id text REFERENCES public.purchases(id),
  product_name text NOT NULL,
  product_category text,
  qty_ordered numeric NOT NULL DEFAULT 0,
  qty_received numeric NOT NULL DEFAULT 0,
  price_unit numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Create purchase order holds table for the hold feature
CREATE TABLE IF NOT EXISTS public.purchase_holds (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id text NOT NULL,
  held_until date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(purchase_id)
);

-- Update product categories in invoices to match Odoo categories
-- This will be handled by the edge function, but we ensure the column exists
ALTER TABLE public.invoices ALTER COLUMN order_lines TYPE jsonb;

-- Enable RLS for new tables
ALTER TABLE public.purchase_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_holds ENABLE ROW LEVEL SECURITY;

-- Create policies for purchase_lines (allow all operations for now)
CREATE POLICY "Allow all operations on purchase_lines" ON public.purchase_lines FOR ALL USING (true);

-- Create policies for purchase_holds (allow all operations for now)  
CREATE POLICY "Allow all operations on purchase_holds" ON public.purchase_holds FOR ALL USING (true);
