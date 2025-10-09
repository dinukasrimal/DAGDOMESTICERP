create extension if not exists "pgcrypto";
create sequence if not exists cut_issue_records_code_seq;

create table if not exists public.cut_issue_records (
  id uuid primary key default gen_random_uuid(),
  issue_code text not null unique default 'ISS-' || lpad(nextval('cut_issue_records_code_seq')::text, 6, '0'),
  purchase_id text references public.purchases(id) on delete set null,
  po_number text not null,
  supplier_id integer references public.cutting_suppliers(id) on delete set null,
  supplier_name text,
  line_items jsonb not null,
  total_cut_quantity numeric,
  weight_kg numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cut_issue_records_purchase on public.cut_issue_records(purchase_id);
create index if not exists idx_cut_issue_records_supplier on public.cut_issue_records(supplier_id);
create index if not exists idx_cut_issue_records_created_at on public.cut_issue_records(created_at desc);
create index if not exists idx_cut_issue_records_code on public.cut_issue_records(issue_code);
