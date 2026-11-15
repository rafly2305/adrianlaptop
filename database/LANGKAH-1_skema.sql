-- LANGKAH 1 dari 4 — Skema, keamanan (RLS), fungsi transaksi, audit. (= migrations 0001 + 0002 + 0003 + 0004)
-- Jalankan SEKALI di Supabase -> SQL Editor pada project yang KOSONG. Tunggu sukses sebelum langkah 2.

-- ======== 0001_schema.sql ========
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

-- ======== 0002_rls.sql ========
-- 0002_rls.sql — Row Level Security berbasis role + cabang.
-- Prinsip: login saja TIDAK memberi akses. Data cabang hanya terlihat bila ada di user_branch_access (atau super_admin).
-- Mutasi kritis (stok, penjualan, transfer) hanya lewat fungsi RPC di 0003.

create function auth_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create function is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from profiles where id = auth.uid() and active), false)
$$;

create function can_access_branch(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select b is not null and (
    is_super() or exists (
      select 1 from user_branch_access a join profiles p on p.id = a.user_id
      where a.user_id = auth.uid() and a.branch_id = b and p.active))
$$;

create function has_role(roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = any(roles), false)
$$;

create function shares_branch(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid = auth.uid() or is_super() or exists (
    select 1 from user_branch_access a1 join user_branch_access a2 on a1.branch_id = a2.branch_id
    where a1.user_id = auth.uid() and a2.user_id = uid)
$$;

create function ops_role() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() <> 'hr', false)   -- hr: belum punya modul operasional, tidak boleh membaca data toko
$$;

alter table branches enable row level security;
alter table profiles enable row level security;
alter table user_branch_access enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table inventory_units enable row level security;
alter table inventory_balances enable row level security;
alter table customers enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table payments enable row level security;
alter table returns enable row level security;
alter table stock_movements enable row level security;
alter table stock_transfers enable row level security;
alter table stock_transfer_items enable row level security;
alter table warranties enable row level security;
alter table service_tickets enable row level security;
alter table service_ticket_history enable row level security;
alter table unit_inspections enable row level security;
alter table audit_logs enable row level security;
alter table app_settings enable row level security;
alter table doc_counters enable row level security;   -- tanpa policy: hanya fungsi security definer

-- ===== SELECT =====
create policy branches_sel on branches for select to authenticated using (can_access_branch(id));
create policy profiles_sel on profiles for select to authenticated using (shares_branch(id));
create policy uba_sel on user_branch_access for select to authenticated using (user_id = auth.uid() or is_super());
create policy categories_sel on categories for select to authenticated using (auth_role() is not null);
create policy products_sel on products for select to authenticated using (auth_role() is not null);
create policy units_sel on inventory_units for select to authenticated using (can_access_branch(branch_id) and ops_role());
create policy balances_sel on inventory_balances for select to authenticated using (can_access_branch(branch_id) and ops_role());
create policy customers_sel on customers for select to authenticated using (can_access_branch(branch_id) and ops_role());
create policy sales_sel on sales for select to authenticated
  using (can_access_branch(branch_id) and has_role(array['super_admin','branch_admin','sales','finance','service_staff']::app_role[]));
create policy sale_items_sel on sale_items for select to authenticated
  using (exists (select 1 from sales s where s.id = sale_id));      -- mewarisi RLS sales
create policy payments_sel on payments for select to authenticated
  using (exists (select 1 from sales s where s.id = sale_id));
create policy returns_sel on returns for select to authenticated
  using (exists (select 1 from sales s where s.id = sale_id));
create policy movements_sel on stock_movements for select to authenticated using (can_access_branch(branch_id) and ops_role());
create policy transfers_sel on stock_transfers for select to authenticated
  using (can_access_branch(from_branch_id) or can_access_branch(to_branch_id));
create policy transfer_items_sel on stock_transfer_items for select to authenticated
  using (exists (select 1 from stock_transfers t where t.id = transfer_id));
create policy warranties_sel on warranties for select to authenticated
  using (exists (select 1 from inventory_units u where u.id = unit_id));
create policy tickets_sel on service_tickets for select to authenticated using (can_access_branch(branch_id) and ops_role());
create policy ticket_hist_sel on service_ticket_history for select to authenticated
  using (exists (select 1 from service_tickets t where t.id = ticket_id));
create policy inspections_sel on unit_inspections for select to authenticated
  using (exists (select 1 from inventory_units u where u.id = unit_id));
create policy audit_sel on audit_logs for select to authenticated
  using (is_super() or (has_role(array['branch_admin']::app_role[]) and can_access_branch(branch_id)));
create policy settings_sel on app_settings for select to authenticated using (auth_role() is not null);

-- ===== Tulis langsung (hanya data non-kritis) =====
create policy categories_w on categories for all to authenticated
  using (has_role(array['super_admin','branch_admin','inventory_staff']::app_role[]))
  with check (has_role(array['super_admin','branch_admin','inventory_staff']::app_role[]));
create policy products_w on products for all to authenticated
  using (has_role(array['super_admin','branch_admin','inventory_staff']::app_role[]))
  with check (has_role(array['super_admin','branch_admin','inventory_staff']::app_role[]));
create policy customers_w on customers for all to authenticated
  using (can_access_branch(branch_id) and has_role(array['super_admin','branch_admin','sales','service_staff']::app_role[]))
  with check (can_access_branch(branch_id) and has_role(array['super_admin','branch_admin','sales','service_staff']::app_role[]));
create policy inspections_w on unit_inspections for insert to authenticated
  with check (has_role(array['super_admin','branch_admin','inventory_staff','service_staff']::app_role[])
              and exists (select 1 from inventory_units u where u.id = unit_id));
create policy settings_w on app_settings for all to authenticated using (is_super()) with check (is_super());
create policy branches_w on branches for update to authenticated using (is_super()) with check (is_super());
create policy profiles_w on profiles for update to authenticated using (is_super()) with check (is_super());
create policy uba_w on user_branch_access for all to authenticated using (is_super()) with check (is_super());

-- Tidak ada policy INSERT/UPDATE/DELETE untuk: inventory_units, inventory_balances, sales, sale_items,
-- payments, returns, stock_movements, stock_transfers(+items), warranties, service_tickets(+history),
-- audit_logs. Semua perubahan lewat RPC (security definer) dengan pemeriksaan role & cabang.

-- ======== 0003_functions.sql ========
-- 0003_functions.sql — Operasi kritis sebagai fungsi transaksional (satu panggilan = satu transaksi).
-- Semua fungsi: security definer + pemeriksaan role/cabang di dalam fungsi + row lock (FOR UPDATE).
-- Pesan exception berupa kode (mis. 'unit_unavailable') yang diterjemahkan oleh aplikasi.

-- ============ Helper internal ============
create function assert_access(p_branch uuid, p_roles app_role[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if auth_role() is null or not (auth_role() = any (p_roles)) then raise exception 'forbidden_role' using errcode = '42501'; end if;
  if not can_access_branch(p_branch) then raise exception 'forbidden_branch' using errcode = '42501'; end if;
end $$;

create function log_audit(p_branch uuid, p_action text, p_entity text, p_id uuid, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into audit_logs(actor_id, branch_id, action, entity, entity_id, detail)
  values (auth.uid(), p_branch, p_action, p_entity, p_id, coalesce(p_detail, '{}'::jsonb))
$$;

create function next_number(p_key text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into doc_counters(key, n) values (p_key, 1)
  on conflict (key) do update set n = doc_counters.n + 1
  returning n into v;
  return v;
end $$;

create function today_wib() returns date
language sql stable as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

create function unit_warranty_state(p_unit uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare w warranties%rowtype;
begin
  select * into w from warranties where unit_id = p_unit and not voided order by end_date desc limit 1;
  if not found or not w.verified then return 'belum_diverifikasi'; end if;
  if w.end_date < today_wib() then return 'berakhir'; end if;
  return 'aktif';
end $$;

-- ============ Penerimaan & penyesuaian stok ============
create function receive_unit(p_product uuid, p_branch uuid, p_serial text, p_condition unit_condition,
                             p_received date, p_cost numeric, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_b branches%rowtype; v_p products%rowtype; v_serial text; v_id uuid; v_code text;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  select * into v_b from branches where id = p_branch and active;
  if not found then raise exception 'branch_not_found'; end if;
  select * into v_p from products where id = p_product and not archived;
  if not found then raise exception 'product_not_found'; end if;
  if v_p.tracking <> 'serialized' then raise exception 'product_not_serialized'; end if;
  v_serial := nullif(upper(btrim(coalesce(p_serial, ''))), '');
  if v_serial is not null and exists (select 1 from inventory_units where upper(serial_number) = v_serial) then
    raise exception 'serial_duplicate';
  end if;
  v_code := 'UNIT-' || v_b.code || '-' || lpad(next_number('UNIT-' || v_b.code)::text, 6, '0');
  begin
    insert into inventory_units(product_id, branch_id, internal_asset_code, serial_number, serial_status, condition,
                                received_at, cost_price, notes, data_origin)
    values (p_product, p_branch, v_code, v_serial,
            case when v_serial is null then 'belum_ada' else 'belum_diverifikasi' end::serial_status,
            coalesce(p_condition, 'belum_diperiksa'), coalesce(p_received, today_wib()), p_cost, p_notes, v_b.data_origin)
    returning id into v_id;
  exception when unique_violation then raise exception 'serial_duplicate';
  end;
  insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
  values (p_branch, p_product, v_id, 'receive', 1, 'unit', v_id, 'Penerimaan barang', auth.uid(), v_b.data_origin);
  perform log_audit(p_branch, 'unit.receive', 'inventory_units', v_id, jsonb_build_object('code', v_code, 'serial', v_serial));
  return v_id;
end $$;

create function receive_quantity(p_product uuid, p_branch uuid, p_qty int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_b branches%rowtype; v_p products%rowtype;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if p_qty is null or p_qty <= 0 then raise exception 'invalid_qty'; end if;
  select * into v_b from branches where id = p_branch and active;
  if not found then raise exception 'branch_not_found'; end if;
  select * into v_p from products where id = p_product and not archived;
  if not found then raise exception 'product_not_found'; end if;
  if v_p.tracking <> 'quantity' then raise exception 'product_not_quantity'; end if;
  insert into inventory_balances(product_id, branch_id, qty) values (p_product, p_branch, p_qty)
  on conflict (product_id, branch_id) do update set qty = inventory_balances.qty + excluded.qty;
  insert into stock_movements(branch_id, product_id, type, qty, reason, actor_id, data_origin)
  values (p_branch, p_product, 'receive', p_qty, coalesce(nullif(btrim(p_reason), ''), 'Penerimaan barang'), auth.uid(), v_b.data_origin);
  perform log_audit(p_branch, 'qty.receive', 'products', p_product, jsonb_build_object('qty', p_qty));
end $$;

create function adjust_stock(p_product uuid, p_branch uuid, p_delta int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_b branches%rowtype; v_p products%rowtype; v_cur int;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if p_delta is null or p_delta = 0 then raise exception 'invalid_qty'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  select * into v_b from branches where id = p_branch;
  select * into v_p from products where id = p_product;
  if not found then raise exception 'product_not_found'; end if;
  if v_p.tracking <> 'quantity' then raise exception 'product_not_quantity'; end if;
  insert into inventory_balances(product_id, branch_id, qty) values (p_product, p_branch, 0) on conflict do nothing;
  select qty into v_cur from inventory_balances where product_id = p_product and branch_id = p_branch for update;
  if v_cur + p_delta < 0 then raise exception 'negative_stock'; end if;
  update inventory_balances set qty = v_cur + p_delta where product_id = p_product and branch_id = p_branch;
  insert into stock_movements(branch_id, product_id, type, qty, reason, actor_id, data_origin)
  values (p_branch, p_product, 'adjust', p_delta, btrim(p_reason), auth.uid(), v_b.data_origin);
  perform log_audit(p_branch, 'stock.adjust', 'products', p_product, jsonb_build_object('delta', p_delta, 'from', v_cur, 'reason', p_reason));
end $$;

create function set_unit_status(p_unit uuid, p_status unit_status, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_u inventory_units%rowtype;
begin
  select * into v_u from inventory_units where id = p_unit for update;
  if not found then raise exception 'unit_not_found'; end if;
  perform assert_access(v_u.branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  if p_status in ('sold', 'in_transit') then raise exception 'status_via_workflow'; end if;
  if v_u.status in ('sold', 'in_transit') then raise exception 'status_via_workflow'; end if;
  update inventory_units set status = p_status, archived = (p_status = 'archived') where id = p_unit;
  insert into stock_movements(branch_id, product_id, unit_id, type, qty, reason, actor_id, data_origin)
  values (v_u.branch_id, v_u.product_id, p_unit, 'adjust', 0, v_u.status::text || ' -> ' || p_status::text || ': ' || btrim(p_reason), auth.uid(), v_u.data_origin);
  perform log_audit(v_u.branch_id, 'unit.status', 'inventory_units', p_unit, jsonb_build_object('from', v_u.status, 'to', p_status, 'reason', p_reason));
end $$;

create function update_unit_details(p_unit uuid, p_condition unit_condition, p_cost numeric,
  p_store_warranty_months int, p_mfr_until date, p_notes text, p_inspection_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare v_u inventory_units%rowtype;
begin
  select * into v_u from inventory_units where id = p_unit for update;
  if not found then raise exception 'unit_not_found'; end if;
  perform assert_access(v_u.branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  update inventory_units set condition = coalesce(p_condition, condition), cost_price = p_cost,
    store_warranty_months = p_store_warranty_months, mfr_warranty_until = p_mfr_until,
    notes = p_notes, inspection_notes = p_inspection_notes where id = p_unit;
  perform log_audit(v_u.branch_id, 'unit.update', 'inventory_units', p_unit, '{}'::jsonb);
end $$;

create function set_unit_serial(p_unit uuid, p_serial text, p_verified boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_u inventory_units%rowtype; v_serial text;
begin
  select * into v_u from inventory_units where id = p_unit for update;
  if not found then raise exception 'unit_not_found'; end if;
  perform assert_access(v_u.branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if v_u.serial_status = 'sintetis_demo' then raise exception 'serial_demo_locked'; end if;
  v_serial := nullif(upper(btrim(coalesce(p_serial, ''))), '');
  if v_serial is not null and exists (select 1 from inventory_units where upper(serial_number) = v_serial and id <> p_unit) then
    raise exception 'serial_duplicate';
  end if;
  begin
    update inventory_units set serial_number = v_serial,
      serial_status = case when v_serial is null then 'belum_ada'
                           when coalesce(p_verified, false) then 'terverifikasi' else 'belum_diverifikasi' end::serial_status
    where id = p_unit;
  exception when unique_violation then raise exception 'serial_duplicate';
  end;
  perform log_audit(v_u.branch_id, 'unit.serial', 'inventory_units', p_unit,
    jsonb_build_object('old', v_u.serial_number, 'new', v_serial, 'verified', coalesce(p_verified, false)));
end $$;

-- ============ Penjualan ============
create function create_sale(p_branch uuid, p_customer jsonb, p_items jsonb, p_method text, p_paid numeric, p_notes text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_b branches%rowtype; v_role app_role := auth_role();
  v_sale uuid; v_cust uuid; v_item jsonb; v_p products%rowtype; v_u inventory_units%rowtype;
  v_qty int; v_price numeric; v_disc numeric; v_line numeric;
  v_sub numeric := 0; v_dsc numeric := 0; v_total numeric; v_paid numeric;
  v_maxpct numeric; v_methods jsonb; v_bal int; v_months int; v_defm int; v_inv text; v_day text;
  v_phone text;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','sales']::app_role[]);
  select * into v_b from branches where id = p_branch and active;
  if not found then raise exception 'branch_not_found'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'empty_cart'; end if;

  select coalesce((value #>> '{}')::numeric, 0) into v_maxpct from app_settings where key = 'max_discount_percent';
  v_maxpct := coalesce(v_maxpct, 0);
  select value into v_methods from app_settings where key = 'payment_methods';
  if p_method is not null and v_methods is not null and jsonb_typeof(v_methods) = 'array' and not (v_methods ? p_method) then
    raise exception 'invalid_payment_method';
  end if;
  if coalesce(p_paid, 1) > 0 and p_method is null then raise exception 'payment_method_required'; end if;

  v_day := to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD');
  v_inv := 'INV-' || v_day || '-' || v_b.code || '-' || lpad(next_number('INV-' || v_b.code || '-' || v_day)::text, 4, '0');

  if nullif(btrim(coalesce(p_customer ->> 'name', '')), '') is not null then
    v_phone := nullif(btrim(coalesce(p_customer ->> 'phone', '')), '');
    if v_phone is not null then
      select id into v_cust from customers where branch_id = p_branch and phone = v_phone limit 1;
    end if;
    if v_cust is null then
      insert into customers(branch_id, name, phone, address, data_origin)
      values (p_branch, btrim(p_customer ->> 'name'), v_phone, nullif(btrim(coalesce(p_customer ->> 'address', '')), ''), v_b.data_origin)
      returning id into v_cust;
    end if;
  end if;

  insert into sales(invoice_no, branch_id, customer_id, cashier_id, payment_method, notes, data_origin)
  values (v_inv, p_branch, v_cust, auth.uid(), p_method, nullif(btrim(coalesce(p_notes, '')), ''), v_b.data_origin)
  returning id into v_sale;

  select (value #>> '{}')::int into v_defm from app_settings where key = 'store_warranty_months';

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_p from products where id = (v_item ->> 'product_id')::uuid and not archived;
    if not found then raise exception 'product_not_found'; end if;
    v_qty := coalesce((v_item ->> 'qty')::int, 1);
    v_price := (v_item ->> 'unit_price')::numeric;
    v_disc := coalesce((v_item ->> 'discount')::numeric, 0);
    if v_qty <= 0 or v_price is null or v_price < 0 or v_disc < 0 or v_disc > v_price * v_qty then raise exception 'invalid_item'; end if;
    if v_role not in ('super_admin', 'branch_admin') and v_disc > v_price * v_qty * v_maxpct / 100 then
      raise exception 'discount_over_limit';
    end if;
    v_line := v_price * v_qty - v_disc;

    if v_p.tracking = 'serialized' then
      if v_qty <> 1 then raise exception 'serialized_qty_must_be_1'; end if;
      select * into v_u from inventory_units where id = (v_item ->> 'unit_id')::uuid and product_id = v_p.id for update;
      if not found or v_u.branch_id <> p_branch or v_u.status <> 'available' or v_u.archived then
        raise exception 'unit_unavailable';
      end if;
      update inventory_units set status = 'sold' where id = v_u.id;
      insert into sale_items(sale_id, product_id, unit_id, qty, unit_price, discount, line_total)
      values (v_sale, v_p.id, v_u.id, 1, v_price, v_disc, v_line);
      insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (p_branch, v_p.id, v_u.id, 'sale', -1, 'sale', v_sale, v_inv, auth.uid(), v_b.data_origin);
      v_months := coalesce(v_u.store_warranty_months, v_defm);
      if v_months is not null and v_months > 0 then
        insert into warranties(unit_id, sale_id, kind, start_date, end_date, verified, data_origin)
        values (v_u.id, v_sale, 'toko', today_wib(), (today_wib() + make_interval(months => v_months))::date,
                v_u.store_warranty_months is not null, v_b.data_origin);
      end if;
    else
      select qty into v_bal from inventory_balances where product_id = v_p.id and branch_id = p_branch for update;
      if v_bal is null or v_bal < v_qty then raise exception 'insufficient_stock'; end if;
      update inventory_balances set qty = qty - v_qty where product_id = v_p.id and branch_id = p_branch;
      insert into sale_items(sale_id, product_id, qty, unit_price, discount, line_total)
      values (v_sale, v_p.id, v_qty, v_price, v_disc, v_line);
      insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (p_branch, v_p.id, 'sale', -v_qty, 'sale', v_sale, v_inv, auth.uid(), v_b.data_origin);
    end if;
    v_sub := v_sub + v_price * v_qty;
    v_dsc := v_dsc + v_disc;
  end loop;

  v_total := v_sub - v_dsc;
  v_paid := least(coalesce(p_paid, v_total), v_total);
  update sales set subtotal = v_sub, discount = v_dsc, total = v_total,
    payment_status = case when v_paid >= v_total then 'paid' when v_paid > 0 then 'partial' else 'unpaid' end::payment_status
  where id = v_sale;
  if v_paid > 0 then
    insert into payments(sale_id, method, amount, data_origin) values (v_sale, p_method, v_paid, v_b.data_origin);
  end if;
  perform log_audit(p_branch, 'sale.create', 'sales', v_sale, jsonb_build_object('invoice', v_inv, 'total', v_total));
  return v_sale;
end $$;

create function void_sale(p_sale uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_s sales%rowtype; v_it sale_items%rowtype;
begin
  select * into v_s from sales where id = p_sale for update;
  if not found then raise exception 'sale_not_found'; end if;
  perform assert_access(v_s.branch_id, array['super_admin','branch_admin']::app_role[]);
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  if v_s.status <> 'completed' then raise exception 'sale_not_voidable'; end if;
  for v_it in select * from sale_items where sale_id = p_sale and active for update loop
    if v_it.unit_id is not null then
      update inventory_units set status = 'available' where id = v_it.unit_id and status = 'sold';
      insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_s.branch_id, v_it.product_id, v_it.unit_id, 'sale_void', 1, 'sale', p_sale, 'Void ' || v_s.invoice_no, auth.uid(), v_s.data_origin);
    else
      insert into inventory_balances(product_id, branch_id, qty) values (v_it.product_id, v_s.branch_id, v_it.qty)
      on conflict (product_id, branch_id) do update set qty = inventory_balances.qty + excluded.qty;
      insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_s.branch_id, v_it.product_id, 'sale_void', v_it.qty, 'sale', p_sale, 'Void ' || v_s.invoice_no, auth.uid(), v_s.data_origin);
    end if;
    update sale_items set active = false where id = v_it.id;
  end loop;
  update warranties set voided = true where sale_id = p_sale;
  update sales set status = 'void', void_reason = btrim(p_reason) where id = p_sale;
  perform log_audit(v_s.branch_id, 'sale.void', 'sales', p_sale, jsonb_build_object('invoice', v_s.invoice_no, 'reason', p_reason));
end $$;

create function return_sale_item(p_item uuid, p_qty int, p_reason text, p_refund numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_it sale_items%rowtype; v_s sales%rowtype; v_done int; v_refunded numeric; v_p products%rowtype;
begin
  select * into v_it from sale_items where id = p_item for update;
  if not found then raise exception 'item_not_found'; end if;
  select * into v_s from sales where id = v_it.sale_id for update;
  perform assert_access(v_s.branch_id, array['super_admin','branch_admin','sales']::app_role[]);
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  if v_s.status in ('void', 'returned') or not v_it.active then raise exception 'item_not_returnable'; end if;
  select coalesce(sum(qty), 0), coalesce(sum(refund_amount), 0) into v_done, v_refunded from returns where sale_item_id = p_item;
  if p_qty is null or p_qty < 1 or p_qty > v_it.qty - v_done then raise exception 'invalid_return_qty'; end if;
  if p_refund is null or p_refund < 0 or v_refunded + p_refund > v_it.line_total then raise exception 'refund_exceeds'; end if;
  select * into v_p from products where id = v_it.product_id;
  if v_it.unit_id is not null then
    update inventory_units set status = 'returned' where id = v_it.unit_id and status = 'sold';
    update warranties set voided = true where unit_id = v_it.unit_id and sale_id = v_s.id;
    update sale_items set active = false where id = p_item;
    insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
    values (v_s.branch_id, v_it.product_id, v_it.unit_id, 'return', 1, 'sale', v_s.id, btrim(p_reason), auth.uid(), v_s.data_origin);
  else
    insert into inventory_balances(product_id, branch_id, qty) values (v_it.product_id, v_s.branch_id, p_qty)
    on conflict (product_id, branch_id) do update set qty = inventory_balances.qty + excluded.qty;
    if v_done + p_qty = v_it.qty then update sale_items set active = false where id = p_item; end if;
    insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
    values (v_s.branch_id, v_it.product_id, 'return', p_qty, 'sale', v_s.id, btrim(p_reason), auth.uid(), v_s.data_origin);
  end if;
  insert into returns(sale_id, sale_item_id, unit_id, qty, reason, refund_amount, created_by, data_origin)
  values (v_s.id, p_item, v_it.unit_id, p_qty, btrim(p_reason), p_refund, auth.uid(), v_s.data_origin);
  update sales set status = case when exists (select 1 from sale_items where sale_id = v_s.id and active)
                                 then 'partially_returned' else 'returned' end::sale_status
  where id = v_s.id;
  perform log_audit(v_s.branch_id, 'sale.return', 'sales', v_s.id, jsonb_build_object('item', p_item, 'qty', p_qty, 'refund', p_refund, 'reason', p_reason));
end $$;

-- ============ Transfer antar-cabang ============
create function create_transfer(p_from uuid, p_to uuid, p_items jsonb, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_f branches%rowtype; v_t branches%rowtype; v_id uuid; v_num text; v_day text; v_item jsonb;
        v_p products%rowtype; v_u inventory_units%rowtype; v_qty int; v_bal int;
begin
  perform assert_access(p_from, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  select * into v_f from branches where id = p_from and active;
  select * into v_t from branches where id = p_to and active;
  if v_f.id is null or v_t.id is null or p_from = p_to then raise exception 'invalid_branches'; end if;
  if v_f.data_origin <> v_t.data_origin then raise exception 'cross_origin_transfer'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'empty_cart'; end if;
  v_day := to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD');
  v_num := 'TRF-' || v_day || '-' || lpad(next_number('TRF-' || v_day)::text, 4, '0');
  insert into stock_transfers(number, from_branch_id, to_branch_id, note, created_by, data_origin)
  values (v_num, p_from, p_to, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), v_f.data_origin) returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_p from products where id = (v_item ->> 'product_id')::uuid;
    if not found then raise exception 'product_not_found'; end if;
    if v_p.tracking = 'serialized' then
      select * into v_u from inventory_units where id = (v_item ->> 'unit_id')::uuid and product_id = v_p.id for update;
      if not found or v_u.branch_id <> p_from or v_u.status <> 'available' or v_u.archived then raise exception 'unit_unavailable'; end if;
      update inventory_units set status = 'in_transit' where id = v_u.id;
      insert into stock_transfer_items(transfer_id, product_id, unit_id, qty) values (v_id, v_p.id, v_u.id, 1);
      insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (p_from, v_p.id, v_u.id, 'transfer_out', -1, 'transfer', v_id, v_num, auth.uid(), v_f.data_origin);
    else
      v_qty := coalesce((v_item ->> 'qty')::int, 0);
      if v_qty <= 0 then raise exception 'invalid_qty'; end if;
      select qty into v_bal from inventory_balances where product_id = v_p.id and branch_id = p_from for update;
      if v_bal is null or v_bal < v_qty then raise exception 'insufficient_stock'; end if;
      update inventory_balances set qty = qty - v_qty where product_id = v_p.id and branch_id = p_from;
      insert into stock_transfer_items(transfer_id, product_id, qty) values (v_id, v_p.id, v_qty);
      insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (p_from, v_p.id, 'transfer_out', -v_qty, 'transfer', v_id, v_num, auth.uid(), v_f.data_origin);
    end if;
  end loop;
  perform log_audit(p_from, 'transfer.create', 'stock_transfers', v_id, jsonb_build_object('number', v_num, 'to', p_to));
  return v_id;
end $$;

create function receive_transfer(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_t stock_transfers%rowtype; v_i stock_transfer_items%rowtype;
begin
  select * into v_t from stock_transfers where id = p_id for update;
  if not found then raise exception 'transfer_not_found'; end if;
  perform assert_access(v_t.to_branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if v_t.status <> 'in_transit' then raise exception 'transfer_not_pending'; end if;
  for v_i in select * from stock_transfer_items where transfer_id = p_id loop
    if v_i.unit_id is not null then
      update inventory_units set branch_id = v_t.to_branch_id, status = 'available' where id = v_i.unit_id and status = 'in_transit';
      insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_t.to_branch_id, v_i.product_id, v_i.unit_id, 'transfer_in', 1, 'transfer', p_id, v_t.number, auth.uid(), v_t.data_origin);
    else
      insert into inventory_balances(product_id, branch_id, qty) values (v_i.product_id, v_t.to_branch_id, v_i.qty)
      on conflict (product_id, branch_id) do update set qty = inventory_balances.qty + excluded.qty;
      insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_t.to_branch_id, v_i.product_id, 'transfer_in', v_i.qty, 'transfer', p_id, v_t.number, auth.uid(), v_t.data_origin);
    end if;
  end loop;
  update stock_transfers set status = 'received', received_by = auth.uid(), received_at = now() where id = p_id;
  perform log_audit(v_t.to_branch_id, 'transfer.receive', 'stock_transfers', p_id, jsonb_build_object('number', v_t.number));
end $$;

create function cancel_transfer(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_t stock_transfers%rowtype; v_i stock_transfer_items%rowtype;
begin
  select * into v_t from stock_transfers where id = p_id for update;
  if not found then raise exception 'transfer_not_found'; end if;
  perform assert_access(v_t.from_branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if v_t.status <> 'in_transit' then raise exception 'transfer_not_pending'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  for v_i in select * from stock_transfer_items where transfer_id = p_id loop
    if v_i.unit_id is not null then
      update inventory_units set status = 'available' where id = v_i.unit_id and status = 'in_transit';
      insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_t.from_branch_id, v_i.product_id, v_i.unit_id, 'transfer_cancel', 1, 'transfer', p_id, btrim(p_reason), auth.uid(), v_t.data_origin);
    else
      insert into inventory_balances(product_id, branch_id, qty) values (v_i.product_id, v_t.from_branch_id, v_i.qty)
      on conflict (product_id, branch_id) do update set qty = inventory_balances.qty + excluded.qty;
      insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_t.from_branch_id, v_i.product_id, 'transfer_cancel', v_i.qty, 'transfer', p_id, btrim(p_reason), auth.uid(), v_t.data_origin);
    end if;
  end loop;
  update stock_transfers set status = 'cancelled', note = coalesce(note || ' | ', '') || 'Batal: ' || btrim(p_reason) where id = p_id;
  perform log_audit(v_t.from_branch_id, 'transfer.cancel', 'stock_transfers', p_id, jsonb_build_object('reason', p_reason));
end $$;

-- ============ Customer service ============
create function create_ticket(p_branch uuid, p_customer jsonb, p_unit uuid, p_sale uuid, p_category text,
                              p_desc text, p_eta date, p_assigned uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_b branches%rowtype; v_id uuid; v_cust uuid; v_day text; v_no text; v_state text; v_phone text; v_u inventory_units%rowtype;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','service_staff','sales']::app_role[]);
  select * into v_b from branches where id = p_branch and active;
  if not found then raise exception 'branch_not_found'; end if;
  if p_desc is null or length(btrim(p_desc)) < 3 or p_category is null or length(btrim(p_category)) < 2 then raise exception 'invalid_ticket'; end if;
  if p_unit is not null then
    select * into v_u from inventory_units where id = p_unit;
    if not found or not can_access_branch(v_u.branch_id) then raise exception 'unit_not_found'; end if;
    v_state := unit_warranty_state(p_unit);
  else
    v_state := 'tidak_ada';
  end if;
  if nullif(btrim(coalesce(p_customer ->> 'name', '')), '') is not null then
    v_phone := nullif(btrim(coalesce(p_customer ->> 'phone', '')), '');
    if v_phone is not null then select id into v_cust from customers where branch_id = p_branch and phone = v_phone limit 1; end if;
    if v_cust is null then
      insert into customers(branch_id, name, phone, address, data_origin)
      values (p_branch, btrim(p_customer ->> 'name'), v_phone, nullif(btrim(coalesce(p_customer ->> 'address', '')), ''), v_b.data_origin)
      returning id into v_cust;
    end if;
  end if;
  v_day := to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD');
  v_no := 'TKT-' || v_day || '-' || v_b.code || '-' || lpad(next_number('TKT-' || v_b.code || '-' || v_day)::text, 4, '0');
  insert into service_tickets(ticket_no, branch_id, customer_id, unit_id, sale_id, category, description, assigned_to, received_at, eta,
                              warranty_state, created_by, data_origin)
  values (v_no, p_branch, v_cust, p_unit, p_sale, btrim(p_category), btrim(p_desc), p_assigned, today_wib(), p_eta, v_state, auth.uid(), v_b.data_origin)
  returning id into v_id;
  insert into service_ticket_history(ticket_id, kind, status, note, actor_id) values (v_id, 'status', 'baru', 'Tiket dibuat', auth.uid());
  perform log_audit(p_branch, 'ticket.create', 'service_tickets', v_id, jsonb_build_object('no', v_no));
  return v_id;
end $$;

create function update_ticket(p_ticket uuid, p_status ticket_status, p_note text, p_kind text, p_assigned uuid,
                              p_eta date, p_resolution text, p_tech_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare v_t service_tickets%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_t from service_tickets where id = p_ticket for update;
  if not found then raise exception 'ticket_not_found'; end if;
  perform assert_access(v_t.branch_id, array['super_admin','branch_admin','service_staff']::app_role[]);
  if p_status in ('selesai', 'ditolak') and (p_resolution is null or length(btrim(p_resolution)) < 3) and v_t.resolution is null then
    raise exception 'resolution_required';
  end if;
  update service_tickets set status = coalesce(p_status, status), assigned_to = coalesce(p_assigned, assigned_to),
    eta = coalesce(p_eta, eta), resolution = coalesce(nullif(btrim(coalesce(p_resolution, '')), ''), resolution),
    technician_notes = coalesce(nullif(btrim(coalesce(p_tech_notes, '')), ''), technician_notes) where id = p_ticket;
  if p_status is not null and p_status <> v_t.status then
    insert into service_ticket_history(ticket_id, kind, status, note, actor_id)
    values (p_ticket, 'status', p_status, coalesce(v_note, 'Status diubah'), auth.uid());
    perform log_audit(v_t.branch_id, 'ticket.status', 'service_tickets', p_ticket, jsonb_build_object('from', v_t.status, 'to', p_status));
  elsif v_note is not null then
    insert into service_ticket_history(ticket_id, kind, status, note, actor_id)
    values (p_ticket, coalesce(nullif(p_kind, ''), 'catatan'), null, v_note, auth.uid());
  end if;
end $$;

-- ============ Reset data demo (tidak menyentuh data 'real' / Cidodol) ============
create function _reset_demo() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from payments where data_origin = 'demo';
  delete from returns where data_origin = 'demo';
  delete from sale_items where sale_id in (select id from sales where data_origin = 'demo');
  delete from warranties where data_origin = 'demo';
  delete from service_ticket_history where ticket_id in (select id from service_tickets where data_origin = 'demo');
  delete from service_tickets where data_origin = 'demo';
  delete from sales where data_origin = 'demo';
  delete from unit_inspections where unit_id in (select id from inventory_units where data_origin = 'demo');
  delete from stock_transfer_items where transfer_id in (select id from stock_transfers where data_origin = 'demo');
  delete from stock_transfers where data_origin = 'demo';
  delete from stock_movements where data_origin = 'demo';
  delete from inventory_balances where branch_id in (select id from branches where data_origin = 'demo');
  delete from inventory_units where data_origin = 'demo';
  delete from customers where data_origin = 'demo';
  delete from audit_logs where branch_id in (select id from branches where data_origin = 'demo');
  delete from doc_counters where key ~ '-(CLD|MRY|PMG|CSK|BTR)(-|$)';
end $$;

create function reset_demo_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super() then raise exception 'forbidden_role' using errcode = '42501'; end if;
  perform _reset_demo();
  perform log_audit(null, 'demo.reset', 'system', null, '{}'::jsonb);
end $$;

-- ============ Hak eksekusi ============
revoke execute on all functions in schema public from public, anon;
grant execute on function auth_role(), is_super(), can_access_branch(uuid), has_role(app_role[]), shares_branch(uuid), ops_role(),
  today_wib(), unit_warranty_state(uuid) to authenticated;
grant execute on function receive_unit(uuid, uuid, text, unit_condition, date, numeric, text),
  receive_quantity(uuid, uuid, int, text), adjust_stock(uuid, uuid, int, text), set_unit_status(uuid, unit_status, text),
  update_unit_details(uuid, unit_condition, numeric, int, date, text, text), set_unit_serial(uuid, text, boolean),
  create_sale(uuid, jsonb, jsonb, text, numeric, text), void_sale(uuid, text), return_sale_item(uuid, int, text, numeric),
  create_transfer(uuid, uuid, jsonb, text), receive_transfer(uuid), cancel_transfer(uuid, text),
  create_ticket(uuid, jsonb, uuid, uuid, text, text, date, uuid),
  update_ticket(uuid, ticket_status, text, text, uuid, date, text, text), reset_demo_data() to authenticated;
-- assert_access, log_audit, next_number, _reset_demo: hanya dipanggil dari dalam fungsi security definer.

-- ======== 0004_audit_triggers.sql ========
-- 0004_audit_triggers.sql — audit perubahan data master & pengaturan (yang ditulis langsung, bukan lewat RPC).
create function audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_branch uuid; v_id uuid;
begin
  if tg_op = 'DELETE' then v_id := (to_jsonb(old) ->> 'id')::uuid; else v_id := (to_jsonb(new) ->> 'id')::uuid; end if;
  v_branch := case when tg_table_name = 'branches' then v_id else null end;
  insert into audit_logs(actor_id, branch_id, action, entity, entity_id, detail)
  values (auth.uid(), v_branch, lower(tg_op), tg_table_name, v_id,
          case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old) - 'specs', 'after', to_jsonb(new) - 'specs')
               when tg_op = 'INSERT' then jsonb_build_object('after', to_jsonb(new) - 'specs') else jsonb_build_object('before', to_jsonb(old) - 'specs') end);
  return coalesce(new, old);
end $$;

-- Hanya jika dipicu oleh pengguna login (seed/migrasi tanpa auth.uid() tidak diaudit agar seed tetap ringan).
create function audit_when_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  return audit_row_change();
end $$;

create trigger trg_audit_products after insert or update on products for each row execute function audit_when_user();
create trigger trg_audit_profiles after update on profiles for each row execute function audit_when_user();
create trigger trg_audit_branches after update on branches for each row execute function audit_when_user();
create trigger trg_audit_settings after insert or update on app_settings for each row execute function audit_when_user();
create trigger trg_audit_uba after insert or delete on user_branch_access for each row execute function audit_when_user();

revoke execute on function audit_row_change(), audit_when_user() from public, anon, authenticated;

