-- Track actual production recorded against planned production
create table if not exists public.production_outputs (
  id uuid primary key default gen_random_uuid(),
  planned_production_id uuid not null references public.planned_production(id) on delete cascade,
  produced_qty numeric not null,
  recorded_at timestamptz not null default now()
);

-- Ensure one record per planned_production row
create unique index if not exists production_outputs_planned_unique on public.production_outputs(planned_production_id);

alter table public.production_outputs enable row level security;

-- Allow authenticated users to manage their production outputs
create policy "Allow authenticated select production outputs" on public.production_outputs
  for select using (auth.role() = 'authenticated');

create policy "Allow authenticated insert production outputs" on public.production_outputs
  for insert with check (auth.role() = 'authenticated');

create policy "Allow authenticated update production outputs" on public.production_outputs
  for update using (auth.role() = 'authenticated');
