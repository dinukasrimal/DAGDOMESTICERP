create extension if not exists "pgcrypto";

create table if not exists public.cutting_records (
  id uuid primary key default gen_random_uuid(),
  purchase_id text references public.purchases(id) on delete set null,
  po_number text not null,
  line_items jsonb not null,
  total_cut_quantity numeric,
  weight_kg numeric not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cutting_records_purchase on public.cutting_records(purchase_id);
create index if not exists idx_cutting_records_created_at on public.cutting_records(created_at desc);
