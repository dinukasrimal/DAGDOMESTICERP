-- Create cutting_suppliers table to manage available cutting suppliers
create table if not exists public.cutting_suppliers (
  id bigserial primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.cutting_suppliers enable row level security;

create policy "Cutting suppliers are viewable by authenticated users"
  on public.cutting_suppliers
  for select
  using (auth.role() = 'authenticated');

create policy "Cutting suppliers can be inserted by authenticated users"
  on public.cutting_suppliers
  for insert
  with check (auth.role() = 'authenticated');

create policy "Cutting suppliers can be updated by authenticated users"
  on public.cutting_suppliers
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Seed with default suppliers if they do not already exist
insert into public.cutting_suppliers (name)
values ('DAG'), ('Jayantha')
on conflict (name) do nothing;
