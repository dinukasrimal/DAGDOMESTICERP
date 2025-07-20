-- Create planned_production table for production planning
-- This table tracks planned and actual production quantities for purchase orders

CREATE TABLE IF NOT EXISTS public.planned_production (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  line_id UUID NOT NULL REFERENCES public.production_lines(id) ON DELETE CASCADE,
  planned_date DATE NOT NULL,
  planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
  actual_quantity INTEGER CHECK (actual_quantity >= 0),
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed')),
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique combination to prevent duplicate planning entries
  UNIQUE(purchase_id, line_id, planned_date, order_index)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_planned_production_line_date ON public.planned_production(line_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_planned_production_purchase_id ON public.planned_production(purchase_id);
CREATE INDEX IF NOT EXISTS idx_planned_production_status ON public.planned_production(status);
CREATE INDEX IF NOT EXISTS idx_planned_production_planned_date ON public.planned_production(planned_date);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_planned_production_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_planned_production_updated_at 
  BEFORE UPDATE ON public.planned_production
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_planned_production_updated_at();

-- Enable Row Level Security (if needed for your app)
ALTER TABLE public.planned_production ENABLE ROW LEVEL SECURITY;

-- Create basic policies for authenticated users (adjust as needed for your requirements)
CREATE POLICY "Users can view planned production" 
ON public.planned_production 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create planned production" 
ON public.planned_production 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update planned production" 
ON public.planned_production 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can delete planned production" 
ON public.planned_production 
FOR DELETE 
USING (true);