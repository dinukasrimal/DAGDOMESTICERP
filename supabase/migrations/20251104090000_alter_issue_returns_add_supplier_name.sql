-- Allow storing free-form supplier information for issue returns
alter table if exists public.issue_returns
  add column if not exists supplier_name text,
  add column if not exists purchase_po_number text;

create index if not exists idx_issue_returns_supplier_name on public.issue_returns (supplier_name);
