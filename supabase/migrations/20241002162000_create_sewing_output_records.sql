create extension if not exists "pgcrypto";
create sequence if not exists sewing_output_records_code_seq;

create table if not exists public.sewing_output_records (
  id uuid primary key default gen_random_uuid(),
  output_code text not null unique default 'SEW-' || lpad(nextval('sewing_output_records_code_seq')::text, 6, '0'),
  supplier_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sewing_output_record_lines (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.sewing_output_records(id) on delete cascade,
  purchase_id text references public.purchases(id) on delete set null,
  po_number text not null,
  output_quantity numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_sewing_output_records_created_at on public.sewing_output_records(created_at desc);
create index if not exists idx_sewing_output_records_supplier on public.sewing_output_records(supplier_name);
create index if not exists idx_sewing_output_record_lines_record on public.sewing_output_record_lines(record_id);
create index if not exists idx_sewing_output_record_lines_po on public.sewing_output_record_lines(po_number);
