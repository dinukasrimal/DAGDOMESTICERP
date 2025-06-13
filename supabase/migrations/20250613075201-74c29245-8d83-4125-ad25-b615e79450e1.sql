
-- Create RLS policies for production_lines table to allow all authenticated users to perform CRUD operations
CREATE POLICY "Allow all authenticated users to select production lines" 
  ON public.production_lines 
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow all authenticated users to insert production lines" 
  ON public.production_lines 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update production lines" 
  ON public.production_lines 
  FOR UPDATE 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow all authenticated users to delete production lines" 
  ON public.production_lines 
  FOR DELETE 
  TO authenticated 
  USING (true);

-- Also create similar policies for holidays and ramp_up_plans tables to prevent similar issues
CREATE POLICY "Allow all authenticated users to select holidays" 
  ON public.holidays 
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow all authenticated users to insert holidays" 
  ON public.holidays 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update holidays" 
  ON public.holidays 
  FOR UPDATE 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow all authenticated users to delete holidays" 
  ON public.holidays 
  FOR DELETE 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow all authenticated users to select ramp up plans" 
  ON public.ramp_up_plans 
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow all authenticated users to insert ramp up plans" 
  ON public.ramp_up_plans 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update ramp up plans" 
  ON public.ramp_up_plans 
  FOR UPDATE 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow all authenticated users to delete ramp up plans" 
  ON public.ramp_up_plans 
  FOR DELETE 
  TO authenticated 
  USING (true);
