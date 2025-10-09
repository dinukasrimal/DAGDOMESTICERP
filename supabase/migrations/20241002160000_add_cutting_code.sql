create sequence if not exists cutting_records_code_seq;

alter table public.cutting_records
  add column if not exists cutting_code text unique;

update public.cutting_records
set cutting_code = 'CUT-' || lpad(nextval('cutting_records_code_seq')::text, 6, '0')
where cutting_code is null;

alter table public.cutting_records
  alter column cutting_code set not null,
  alter column cutting_code set default 'CUT-' || lpad(nextval('cutting_records_code_seq')::text, 6, '0');

create index if not exists idx_cutting_records_code on public.cutting_records(cutting_code);
