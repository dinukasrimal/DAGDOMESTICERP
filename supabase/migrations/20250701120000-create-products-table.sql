-- Create products table for Odoo product master data
CREATE TABLE IF NOT EXISTS public.products (
  id bigint PRIMARY KEY, -- Odoo product ID
  name text NOT NULL,
  default_code text,
  product_category text,
  category_id bigint,
  type text,
  uom text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id); 