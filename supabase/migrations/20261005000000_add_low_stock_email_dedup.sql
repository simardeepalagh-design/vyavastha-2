alter table public.stock
  add column if not exists low_stock_alerted boolean not null default false;
