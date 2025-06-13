
-- Insert some default production lines (only if they don't exist)
INSERT INTO public.production_lines (name, capacity) VALUES
  ('Line A - Knitwear', 100),
  ('Line B - Woven', 80),
  ('Line C - Casual', 120),
  ('Line D - Formal', 90)
ON CONFLICT DO NOTHING;

-- Insert some default holidays
INSERT INTO public.holidays (name, date) VALUES
  ('New Year Day', '2025-01-01'),
  ('Christmas Day', '2025-12-25'),
  ('Independence Day', '2025-02-04')
ON CONFLICT DO NOTHING;

-- Insert some default ramp-up plans
INSERT INTO public.ramp_up_plans (name, efficiencies, final_efficiency) VALUES
  ('Standard Plan', '[{"day": 1, "efficiency": 50}, {"day": 2, "efficiency": 70}, {"day": 3, "efficiency": 85}, {"day": 4, "efficiency": 90}]', 90),
  ('Fast Track Plan', '[{"day": 1, "efficiency": 70}, {"day": 2, "efficiency": 85}, {"day": 3, "efficiency": 95}]', 95)
ON CONFLICT DO NOTHING;
