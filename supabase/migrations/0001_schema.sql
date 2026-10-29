-- 0001_schema.sql — Skema inti Adrian Laptop Store (PostgreSQL / Supabase)
-- Uang: numeric(14,2). Waktu: timestamptz. Semua tabel operasional punya data_origin ('real'|'demo').

create type app_role as enum ('super_admin','branch_admin','inventory_staff','sales','service_staff','finance','hr');
create type data_origin as enum ('real','demo');
create type tracking_mode as enum ('serialized','quantity');
create type unit_status as enum ('available','reserved','sold','damaged','returned','in_warranty','in_transit','archived');
create type unit_condition as enum ('baru','bekas_baik','bekas_cukup','perlu_perbaikan','belum_diperiksa');
create type serial_status as enum ('belum_ada','belum_diverifikasi','terverifikasi','sintetis_demo');
create type sale_status as enum ('completed','partially_returned','returned','void');
create type payment_status as enum ('paid','partial','unpaid');
create type ticket_status as enum ('baru','diproses','menunggu_spare_part','menunggu_pelanggan','selesai','ditolak');
create type movement_type as enum ('receive','issue','sale','sale_void','return','adjust','transfer_out','transfer_in','transfer_cancel');
create type transfer_status as enum ('in_transit','received','cancelled');

create table branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{3}$'),
  name text not null,
  city text,
  is_demo boolean not null default false,
  active boolean not null default true,
  data_origin data_origin not null default 'real',
  created_at timestamptz not null default now(),
  check ((data_origin = 'demo') = is_demo)
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role app_role not null,
  active boolean not null default true,
  default_branch_id uuid references branches(id),
  created_at timestamptz not null default now()
);

create table user_branch_access (
  user_id uuid not null references profiles(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  primary key (user_id, branch_id)
);
create index on user_branch_access (branch_id);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_tracking tracking_mode not null default 'serialized'
);

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  original_name text,
  brand text, model text,
  category_id uuid references categories(id),
  tracking tracking_mode not null default 'serialized',
  processor text, ram_gb int check (ram_gb is null or ram_gb > 0),
  storage text, touchscreen boolean,
  specs jsonb not null default '{}'::jsonb,
  min_stock int check (min_stock is null or min_stock >= 0),
  default_price numeric(14,2) check (default_price is null or default_price >= 0),
  needs_verification boolean not null default false,
  source_ref text,
  archived boolean not null default false,
  data_origin data_origin not null default 'real',
  created_at timestamptz not null default now()
);
create index on products (category_id);

create table inventory_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  branch_id uuid not null references branches(id),
  internal_asset_code text not null unique,
  serial_number text,
  serial_status serial_status not null default 'belum_ada',
  status unit_status not null default 'available',
  condition unit_condition not null default 'belum_diperiksa',
  received_at date,
  cost_price numeric(14,2) check (cost_price is null or cost_price >= 0),
  store_warranty_months int check (store_warranty_months is null or store_warranty_months >= 0),
  mfr_warranty_until date,
  notes text, inspection_notes text,
  source_ref int, source_raw text,
  archived boolean not null default false,
  data_origin data_origin not null default 'real',
  created_at timestamptz not null default now(),
  check (serial_number is null or length(btrim(serial_number)) > 0),
  check (serial_status <> 'terverifikasi' or serial_number is not null),
  check (serial_status <> 'belum_ada' or serial_number is null)
);
create unique index inventory_units_serial_uq on inventory_units (upper(serial_number)) where serial_number is not null;
create index on inventory_units (branch_id, status);
create index on inventory_units (product_id);
create index on inventory_units (data_origin);

create table inventory_balances (
  product_id uuid not null references products(id),
  branch_id uuid not null references branches(id),
  qty int not null default 0 check (qty >= 0),
  primary key (product_id, branch_id)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  name text not null, phone text, address text,
  data_origin data_origin not null default 'real',
  created_at timestamptz not null default now()
);
create index on customers (branch_id);
create index on customers (phone);

create table sales (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  branch_id uuid not null references branches(id),
  customer_id uuid references customers(id),
  cashier_id uuid references profiles(id),
  sold_at timestamptz not null default now(),
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0 check (total >= 0),
  payment_status payment_status not null default 'unpaid',
  payment_method text,
  status sale_status not null default 'completed',
  void_reason text, notes text,
  data_origin data_origin not null default 'real',
  created_at timestamptz not null default now()
);
create index on sales (branch_id, sold_at desc);
create index on sales (status);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id),
  product_id uuid not null references products(id),
  unit_id uuid references inventory_units(id),
  qty int not null check (qty > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  active boolean not null default true      -- false setelah void/retur; riwayat tetap tersimpan
);
create index on sale_items (sale_id);
-- Satu unit berseri hanya boleh punya satu baris penjualan AKTIF (mencegah dijual dua kali).
create unique index sale_items_unit_uq on sale_items (unit_id) where unit_id is not null and active;

create table payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id),
  method text not null, amount numeric(14,2) not null check (amount >= 0),
  paid_at timestamptz not null default now(), reference text,
  data_origin data_origin not null default 'real'
);
create index on payments (sale_id);

create table returns (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id),
  sale_item_id uuid not null references sale_items(id),
  unit_id uuid references inventory_units(id),
  qty int not null default 1 check (qty > 0),
  reason text not null,
  refund_amount numeric(14,2) not null default 0 check (refund_amount >= 0),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  data_origin data_origin not null default 'real'
);
create index on returns (sale_id);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  product_id uuid not null references products(id),
  unit_id uuid references inventory_units(id),
  type movement_type not null,
  qty int not null,
  ref_type text, ref_id uuid, reason text,
  actor_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  data_origin data_origin not null default 'real'
);
create index on stock_movements (branch_id, created_at desc);
create index on stock_movements (unit_id);
create index on stock_movements (product_id);

create table stock_transfers (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  from_branch_id uuid not null references branches(id),
  to_branch_id uuid not null references branches(id),
  status transfer_status not null default 'in_transit',
  note text,
  created_by uuid references profiles(id), received_by uuid references profiles(id),
  created_at timestamptz not null default now(), received_at timestamptz,
  data_origin data_origin not null default 'real',
  check (from_branch_id <> to_branch_id)
);
create table stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references stock_transfers(id),
  product_id uuid not null references products(id),
  unit_id uuid references inventory_units(id),
  qty int not null default 1 check (qty > 0)
);
create index on stock_transfer_items (transfer_id);

create table warranties (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references inventory_units(id),
  sale_id uuid references sales(id),
  kind text not null default 'toko' check (kind in ('toko','produsen')),
  start_date date not null, end_date date not null,
  verified boolean not null default false,
  voided boolean not null default false,
  data_origin data_origin not null default 'real',
  check (end_date >= start_date)
);
create index on warranties (unit_id);

create table service_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique,
  branch_id uuid not null references branches(id),
  customer_id uuid references customers(id),
  unit_id uuid references inventory_units(id),
  sale_id uuid references sales(id),
  category text not null,
  description text not null,
  status ticket_status not null default 'baru',
  assigned_to uuid references profiles(id),
  received_at date not null default current_date,
  eta date,
  warranty_state text not null default 'belum_diverifikasi'
    check (warranty_state in ('aktif','berakhir','belum_diverifikasi','tidak_ada')),
  resolution text, technician_notes text, attachment_url text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  data_origin data_origin not null default 'real'
);
create index on service_tickets (branch_id, status);
create index on service_tickets (unit_id);

create table service_ticket_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references service_tickets(id),
  kind text not null default 'status' check (kind in ('status','tindakan','komunikasi','catatan')),
  status ticket_status,
  note text,
  actor_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on service_ticket_history (ticket_id, created_at);

create table unit_inspections (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references inventory_units(id),
  checked_at date not null default current_date,
  checked_by uuid references profiles(id),
  checklist jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);
create index on unit_inspections (unit_id);

create table audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references profiles(id) on delete set null,
  branch_id uuid,
  action text not null, entity text, entity_id uuid,
  detail jsonb not null default '{}'::jsonb
);
create index on audit_logs (at desc);
create index on audit_logs (branch_id, at desc);

create table app_settings (
  key text primary key,
  value jsonb,
  updated_by uuid, updated_at timestamptz not null default now()
);

create table doc_counters (key text primary key, n bigint not null default 0);

create view product_stock with (security_invoker = true) as
select p.id as product_id, b.id as branch_id,
  case when p.tracking = 'serialized'
    then (select count(*) from inventory_units u where u.product_id = p.id and u.branch_id = b.id and u.status = 'available' and not u.archived)
    else coalesce((select ib.qty from inventory_balances ib where ib.product_id = p.id and ib.branch_id = b.id), 0) end::int as available,
  case when p.tracking = 'serialized'
    then (select count(*) from inventory_units u where u.product_id = p.id and u.branch_id = b.id and not u.archived)
    else coalesce((select ib.qty from inventory_balances ib where ib.product_id = p.id and ib.branch_id = b.id), 0) end::int as total
from products p cross join branches b;
