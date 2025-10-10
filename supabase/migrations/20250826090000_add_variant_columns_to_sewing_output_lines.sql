alter table if exists public.sewing_output_record_lines
  add column if not exists order_line_id text,
  add column if not exists product_name text,
  add column if not exists ordered_quantity numeric,
  add column if not exists cut_quantity numeric,
  add column if not exists issue_quantity numeric;
