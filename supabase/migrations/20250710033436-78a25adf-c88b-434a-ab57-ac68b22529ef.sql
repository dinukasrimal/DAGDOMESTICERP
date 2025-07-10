-- Create sales_targets table to store customer targets
CREATE TABLE public.sales_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  target_year TEXT NOT NULL,
  target_months TEXT[] NOT NULL,
  base_year TEXT NOT NULL,
  target_data JSONB NOT NULL,
  initial_total_qty NUMERIC NOT NULL DEFAULT 0,
  initial_total_value NUMERIC NOT NULL DEFAULT 0,
  adjusted_total_qty NUMERIC NOT NULL DEFAULT 0,
  adjusted_total_value NUMERIC NOT NULL DEFAULT 0,
  percentage_increase NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Ensure unique combination of customer, target year, and months
  UNIQUE(customer_name, target_year, target_months)
);

-- Enable Row Level Security
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Users can view all sales targets" 
ON public.sales_targets 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create sales targets" 
ON public.sales_targets 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own sales targets" 
ON public.sales_targets 
FOR UPDATE 
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own sales targets" 
ON public.sales_targets 
FOR DELETE 
USING (auth.uid() = created_by);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_sales_targets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_sales_targets_updated_at
BEFORE UPDATE ON public.sales_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_sales_targets_updated_at();