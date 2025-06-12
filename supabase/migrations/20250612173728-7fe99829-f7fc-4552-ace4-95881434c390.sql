
-- Create enum types
CREATE TYPE order_status AS ENUM ('pending', 'scheduled', 'in_progress', 'completed');
CREATE TYPE user_role AS ENUM ('superuser', 'planner');

-- Create profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role DEFAULT 'planner',
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create production_lines table
CREATE TABLE public.production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create holidays table
CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create ramp_up_plans table
CREATE TABLE public.ramp_up_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  efficiencies JSONB NOT NULL, -- Array of {day: number, efficiency: number}
  final_efficiency INTEGER NOT NULL DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT NOT NULL,
  style_id TEXT NOT NULL,
  order_quantity INTEGER NOT NULL,
  smv DECIMAL NOT NULL,
  mo_count INTEGER NOT NULL,
  cut_quantity INTEGER NOT NULL,
  issue_quantity INTEGER NOT NULL,
  status order_status DEFAULT 'pending',
  plan_start_date DATE,
  plan_end_date DATE,
  actual_production JSONB DEFAULT '{}', -- Daily production plan
  assigned_line_id UUID REFERENCES public.production_lines(id),
  base_po_number TEXT,
  split_number INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ramp_up_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Create function to check if user is superuser
CREATE OR REPLACE FUNCTION public.is_superuser()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'superuser'
  );
$$;

-- Create RLS policies for production_lines
CREATE POLICY "Authenticated users can view production lines" ON public.production_lines
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Superusers can manage production lines" ON public.production_lines
  FOR ALL TO authenticated USING (public.is_superuser());

-- Create RLS policies for holidays
CREATE POLICY "Authenticated users can view holidays" ON public.holidays
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Superusers can manage holidays" ON public.holidays
  FOR ALL TO authenticated USING (public.is_superuser());

-- Create RLS policies for ramp_up_plans
CREATE POLICY "Authenticated users can view ramp up plans" ON public.ramp_up_plans
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Superusers can manage ramp up plans" ON public.ramp_up_plans
  FOR ALL TO authenticated USING (public.is_superuser());

-- Create RLS policies for orders
CREATE POLICY "Authenticated users can view orders" ON public.orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage orders" ON public.orders
  FOR ALL TO authenticated USING (true);

-- Create trigger to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    'planner'::user_role
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert default data
INSERT INTO public.production_lines (name, capacity) VALUES
  ('Line A - Knitwear', 150),
  ('Line B - Wovens', 120),
  ('Line C - Casual Wear', 100);

INSERT INTO public.holidays (date, name) VALUES
  ('2024-12-25', 'Christmas Day'),
  ('2024-01-01', 'New Year Day');

INSERT INTO public.ramp_up_plans (name, efficiencies, final_efficiency) VALUES
  ('Standard Ramp-Up', '[{"day": 1, "efficiency": 50}, {"day": 2, "efficiency": 70}, {"day": 3, "efficiency": 85}]', 90),
  ('Fast Track', '[{"day": 1, "efficiency": 70}, {"day": 2, "efficiency": 85}]', 95);
