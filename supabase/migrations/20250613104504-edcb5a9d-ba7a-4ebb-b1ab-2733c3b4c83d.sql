
-- Add a junction table to link holidays with specific production lines
CREATE TABLE public.holiday_production_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  holiday_id UUID NOT NULL REFERENCES public.holidays(id) ON DELETE CASCADE,
  production_line_id UUID NOT NULL REFERENCES public.production_lines(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(holiday_id, production_line_id)
);

-- Add a column to holidays table to indicate if it's global or line-specific
ALTER TABLE public.holidays 
ADD COLUMN is_global BOOLEAN NOT NULL DEFAULT true;

-- Create index for better performance
CREATE INDEX idx_holiday_production_lines_holiday_id ON public.holiday_production_lines(holiday_id);
CREATE INDEX idx_holiday_production_lines_line_id ON public.holiday_production_lines(production_line_id);
