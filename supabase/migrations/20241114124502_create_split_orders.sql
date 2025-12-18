-- Store split purchase orders
create table if not exists public.split_orders (
  id uuid primary key default gen_random_uuid(),
  original_po_id text not null,
  original_po_name text not null,
  split_name text not null,
  split_index integer not null,
  quantity numeric not null,
  partner_name text,
  date_order date,
  amount_total numeric,
  state text default 'purchase',
  order_lines jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create index if not exists split_orders_original_idx on public.split_orders(original_po_id);

alter table public.split_orders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'split_orders' and policyname = 'Allow authenticated select split orders'
  ) then
    create policy "Allow authenticated select split orders" on public.split_orders
      for select using (auth.role() = 'authenticated');
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'split_orders' and policyname = 'Allow authenticated insert split orders'
  ) then
    create policy "Allow authenticated insert split orders" on public.split_orders
      for insert with check (auth.role() = 'authenticated');
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'split_orders' and policyname = 'Allow authenticated update split orders'
  ) then
    create policy "Allow authenticated update split orders" on public.split_orders
      for update using (auth.role() = 'authenticated');
  end if;
end$$;

-- Allow authenticated users to delete split orders (needed for unsplitting)
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' and tablename = 'split_orders' and policyname = 'Allow authenticated delete split orders'
  ) then
    create policy "Allow authenticated delete split orders" on public.split_orders
      for delete using (auth.role() = 'authenticated');
  end if;
end$$;
