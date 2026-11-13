-- 0007_inventory_pos.sql — Inventory lengkap (barang masuk/keluar, stok opname, transfer bertahap, riwayat stok before/after)
-- dan POS (foto produk, pembayaran tunai/non-tunai, pajak, dokumen). Aman dijalankan pada data yang sudah ada (tidak menghapus data).
-- Jalankan SETELAH 0006_transfer_pending.sql.

-- ===== Kolom baru =====
alter table stock_movements add column if not exists stock_before int, add column if not exists stock_after int,
  add column if not exists ref_no text, add column if not exists supplier text, add column if not exists note text;
alter table products add column if not exists image_url text;
alter table payments add column if not exists tendered numeric(14,2), add column if not exists change_amount numeric(14,2), add column if not exists note text;
alter table sales add column if not exists tax numeric(14,2) not null default 0;

-- ===== Pengaturan default (tidak menimpa yang sudah diubah) =====
insert into app_settings(key, value) values ('payment_methods', '["Tunai","Transfer Bank","QRIS","Kartu Debit/Kredit","E-Wallet"]'::jsonb)
  on conflict (key) do update set value = excluded.value where app_settings.value = '["Tunai","Non Tunai"]'::jsonb;
insert into app_settings(key, value) values ('tax_percent', '0'::jsonb) on conflict (key) do nothing;
insert into app_settings(key, value) values ('company_address', '""'::jsonb) on conflict (key) do nothing;
insert into app_settings(key, value) values ('company_phone', '""'::jsonb) on conflict (key) do nothing;
insert into app_settings(key, value) values ('receipt_footer', '"Terima kasih atas kunjungan Anda"'::jsonb) on conflict (key) do nothing;

-- ===== Bucket foto produk (publik, baca saja; unggah hanya lewat server) =====
do $$ begin
  insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true) on conflict (id) do nothing;
exception when others then
  raise notice 'Bucket product-images belum dibuat otomatis: buat manual di Supabase Storage (Public).';
end $$;

-- ===== Riwayat pergerakan: isi stok sebelum/sesudah otomatis untuk SEMUA pergerakan baru =====
create or replace function stock_movement_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_after int; v_delta int; v_tr tracking_mode;
begin
  if new.stock_after is not null then return new; end if;
  select tracking into v_tr from products where id = new.product_id;
  if v_tr is null then return new; end if;
  if v_tr = 'serialized' then
    select count(*)::int into v_after from inventory_units u
     where u.product_id = new.product_id and u.branch_id = new.branch_id and u.status = 'available' and not u.archived;
  else
    select coalesce((select ib.qty from inventory_balances ib where ib.product_id = new.product_id and ib.branch_id = new.branch_id), 0) into v_after;
  end if;
  v_delta := case when new.unit_id is not null and new.type = 'return' then 0
                  when new.unit_id is not null and new.qty = 0 then 0
                  else new.qty end;
  new.stock_after := v_after;
  new.stock_before := v_after - v_delta;
  return new;
end $$;
drop trigger if exists trg_stock_movement_fill on stock_movements;
create trigger trg_stock_movement_fill before insert on stock_movements for each row execute function stock_movement_fill();

-- ===== Barang masuk (dengan pemasok / referensi / catatan / tanggal) =====
create or replace function receive_goods(p_branch uuid, p_product uuid, p_serial text, p_condition unit_condition, p_date date,
                                         p_cost numeric, p_qty int, p_supplier text, p_ref text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_p products%rowtype; v_unit uuid; v_mv uuid; v_when timestamptz;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  select * into v_p from products where id = p_product and not archived;
  if not found then raise exception 'product_not_found'; end if;
  v_when := case when p_date is null or p_date = today_wib() then now()
                 else (p_date::timestamp at time zone 'Asia/Jakarta') + interval '12 hours' end;
  if v_p.tracking = 'serialized' then
    v_unit := receive_unit(p_product, p_branch, p_serial, p_condition, p_date, p_cost, p_note);
    select id into v_mv from stock_movements where unit_id = v_unit and type = 'receive' order by created_at desc limit 1;
  else
    perform receive_quantity(p_product, p_branch, p_qty, coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Penerimaan barang'));
    select id into v_mv from stock_movements
     where branch_id = p_branch and product_id = p_product and type = 'receive' and actor_id = auth.uid()
     order by created_at desc limit 1;
  end if;
  update stock_movements
     set supplier = nullif(btrim(coalesce(p_supplier, '')), ''), ref_no = nullif(btrim(coalesce(p_ref, '')), ''),
         note = nullif(btrim(coalesce(p_note, '')), ''), created_at = v_when
   where id = v_mv;
end $$;

-- ===== Barang keluar =====
create or replace function issue_stock(p_branch uuid, p_product uuid, p_unit uuid, p_qty int, p_reason text, p_date date, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_b branches%rowtype; v_p products%rowtype; v_u inventory_units%rowtype; v_bal int; v_no text; v_day text;
        v_when timestamptz; v_mv uuid; v_label text; v_qty int;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if p_reason is null or p_reason not in ('rusak', 'internal', 'hilang', 'lainnya') then raise exception 'invalid_reason'; end if;
  if p_reason = 'lainnya' and (p_note is null or length(btrim(p_note)) < 3) then raise exception 'reason_required'; end if;
  select * into v_b from branches where id = p_branch and active;
  if not found then raise exception 'branch_not_found'; end if;
  select * into v_p from products where id = p_product and not archived;
  if not found then raise exception 'product_not_found'; end if;
  v_label := case p_reason when 'rusak' then 'Barang rusak' when 'internal' then 'Kebutuhan internal'
                           when 'hilang' then 'Barang hilang' else 'Pengeluaran lainnya' end;
  v_day := to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD');
  v_no := 'OUT-' || v_day || '-' || lpad(next_number('OUT-' || v_day)::text, 4, '0');
  v_when := case when p_date is null or p_date = today_wib() then now()
                 else (p_date::timestamp at time zone 'Asia/Jakarta') + interval '12 hours' end;
  if v_p.tracking = 'serialized' then
    select * into v_u from inventory_units where id = p_unit and product_id = p_product for update;
    if not found or v_u.branch_id <> p_branch or v_u.status <> 'available' or v_u.archived then raise exception 'unit_unavailable'; end if;
    update inventory_units
       set status = (case when p_reason = 'rusak' then 'damaged' else 'archived' end)::unit_status, archived = (p_reason <> 'rusak')
     where id = v_u.id;
    insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, created_at, data_origin, ref_no, note)
    values (p_branch, p_product, v_u.id, 'issue', -1, 'issue', v_u.id, v_label, auth.uid(), v_when, v_b.data_origin, v_no, nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_mv;
    v_qty := 1;
  else
    v_qty := coalesce(p_qty, 0);
    if v_qty <= 0 then raise exception 'invalid_qty'; end if;
    select qty into v_bal from inventory_balances where product_id = p_product and branch_id = p_branch for update;
    if v_bal is null or v_bal < v_qty then raise exception 'insufficient_stock'; end if;
    update inventory_balances set qty = qty - v_qty where product_id = p_product and branch_id = p_branch;
    insert into stock_movements(branch_id, product_id, type, qty, ref_type, reason, actor_id, created_at, data_origin, ref_no, note)
    values (p_branch, p_product, 'issue', -v_qty, 'issue', v_label, auth.uid(), v_when, v_b.data_origin, v_no, nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_mv;
  end if;
  perform log_audit(p_branch, 'stock.issue', 'products', p_product, jsonb_build_object('no', v_no, 'qty', v_qty, 'reason', v_label));
  return v_mv;
end $$;

-- ===== Stok opname =====
create table if not exists stock_opnames (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  branch_id uuid not null references branches(id),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  note text,
  created_by uuid references profiles(id), created_at timestamptz not null default now(),
  confirmed_by uuid references profiles(id), confirmed_at timestamptz,
  data_origin data_origin not null default 'real'
);
create index if not exists stock_opnames_branch_idx on stock_opnames (branch_id, created_at desc);
create table if not exists stock_opname_items (
  id uuid primary key default gen_random_uuid(),
  opname_id uuid not null references stock_opnames(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_id uuid references inventory_units(id),
  system_qty int not null check (system_qty >= 0),
  physical_qty int check (physical_qty is null or physical_qty >= 0),
  reason text
);
create index if not exists stock_opname_items_idx on stock_opname_items (opname_id);
alter table stock_opnames enable row level security;
alter table stock_opname_items enable row level security;
drop policy if exists opnames_sel on stock_opnames;
create policy opnames_sel on stock_opnames for select to authenticated using (can_access_branch(branch_id) and ops_role());
drop policy if exists opname_items_sel on stock_opname_items;
create policy opname_items_sel on stock_opname_items for select to authenticated
  using (exists (select 1 from stock_opnames o where o.id = opname_id));

create or replace function opname_create(p_branch uuid, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_b branches%rowtype; v_id uuid; v_no text; v_day text;
begin
  perform assert_access(p_branch, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  select * into v_b from branches where id = p_branch and active;
  if not found then raise exception 'branch_not_found'; end if;
  if exists (select 1 from stock_opnames where branch_id = p_branch and status = 'draft') then raise exception 'opname_in_progress'; end if;
  v_day := to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD');
  v_no := 'OPN-' || v_day || '-' || lpad(next_number('OPN-' || v_day)::text, 4, '0');
  insert into stock_opnames(number, branch_id, note, created_by, data_origin)
  values (v_no, p_branch, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), v_b.data_origin) returning id into v_id;
  insert into stock_opname_items(opname_id, product_id, unit_id, system_qty, physical_qty)
    select v_id, u.product_id, u.id, 1, 1 from inventory_units u
     where u.branch_id = p_branch and u.status = 'available' and not u.archived;
  insert into stock_opname_items(opname_id, product_id, unit_id, system_qty, physical_qty)
    select v_id, p.id, null, coalesce(ib.qty, 0), coalesce(ib.qty, 0)
      from products p left join inventory_balances ib on ib.product_id = p.id and ib.branch_id = p_branch
     where p.tracking = 'quantity' and not p.archived;
  perform log_audit(p_branch, 'opname.create', 'stock_opnames', v_id, jsonb_build_object('number', v_no));
  return v_id;
end $$;

create or replace function opname_save(p_id uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_o stock_opnames%rowtype; v_it jsonb; v_row stock_opname_items%rowtype; v_phys int;
begin
  select * into v_o from stock_opnames where id = p_id for update;
  if not found then raise exception 'opname_not_found'; end if;
  perform assert_access(v_o.branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if v_o.status <> 'draft' then raise exception 'opname_not_draft'; end if;
  for v_it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into v_row from stock_opname_items where id = (v_it ->> 'id')::uuid and opname_id = p_id;
    if not found then continue; end if;
    v_phys := (v_it ->> 'physical')::int;
    if v_phys is null or v_phys < 0 or (v_row.unit_id is not null and v_phys > 1) then raise exception 'invalid_qty'; end if;
    update stock_opname_items
       set physical_qty = v_phys, reason = nullif(btrim(coalesce(v_it ->> 'reason', '')), '')
     where id = v_row.id;
  end loop;
end $$;

create or replace function opname_confirm(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_o stock_opnames%rowtype; v_i stock_opname_items%rowtype; v_u inventory_units%rowtype;
        v_delta int; v_cur int; v_n int := 0;
begin
  select * into v_o from stock_opnames where id = p_id for update;
  if not found then raise exception 'opname_not_found'; end if;
  perform assert_access(v_o.branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if v_o.status <> 'draft' then raise exception 'opname_not_draft'; end if;
  for v_i in select * from stock_opname_items
              where opname_id = p_id and physical_qty is not null and physical_qty <> system_qty order by id loop
    if v_i.reason is null or length(btrim(v_i.reason)) < 3 then raise exception 'reason_required'; end if;
    v_delta := v_i.physical_qty - v_i.system_qty;
    if v_i.unit_id is not null then
      select * into v_u from inventory_units where id = v_i.unit_id for update;
      if not found or v_u.branch_id <> v_o.branch_id or v_u.status <> 'available' or v_u.archived then raise exception 'unit_unavailable'; end if;
      update inventory_units set status = 'archived', archived = true where id = v_u.id;
      insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin, ref_no, note)
      values (v_o.branch_id, v_i.product_id, v_u.id, 'adjust', -1, 'opname', p_id, 'Stok opname: unit tidak ditemukan',
              auth.uid(), v_o.data_origin, v_o.number, btrim(v_i.reason));
    else
      insert into inventory_balances(product_id, branch_id, qty) values (v_i.product_id, v_o.branch_id, 0) on conflict do nothing;
      select qty into v_cur from inventory_balances where product_id = v_i.product_id and branch_id = v_o.branch_id for update;
      if v_cur + v_delta < 0 then raise exception 'negative_stock'; end if;
      update inventory_balances set qty = v_cur + v_delta where product_id = v_i.product_id and branch_id = v_o.branch_id;
      insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin, ref_no, note)
      values (v_o.branch_id, v_i.product_id, 'adjust', v_delta, 'opname', p_id, 'Stok opname: penyesuaian selisih',
              auth.uid(), v_o.data_origin, v_o.number, btrim(v_i.reason));
    end if;
    v_n := v_n + 1;
  end loop;
  update stock_opnames set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now() where id = p_id;
  perform log_audit(v_o.branch_id, 'opname.confirm', 'stock_opnames', p_id, jsonb_build_object('number', v_o.number, 'adjusted', v_n));
end $$;

create or replace function opname_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_o stock_opnames%rowtype;
begin
  select * into v_o from stock_opnames where id = p_id for update;
  if not found then raise exception 'opname_not_found'; end if;
  perform assert_access(v_o.branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if v_o.status <> 'draft' then raise exception 'opname_not_draft'; end if;
  update stock_opnames set status = 'cancelled' where id = p_id;
  perform log_audit(v_o.branch_id, 'opname.cancel', 'stock_opnames', p_id, jsonb_build_object('number', v_o.number));
end $$;

-- ===== Transfer bertahap: Menunggu -> Dalam Pengiriman -> Diterima / Dibatalkan =====
create or replace function request_transfer(p_from uuid, p_to uuid, p_items jsonb, p_note text) returns uuid
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
  insert into stock_transfers(number, from_branch_id, to_branch_id, status, note, created_by, data_origin)
  values (v_num, p_from, p_to, 'pending', nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), v_f.data_origin) returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_p from products where id = (v_item ->> 'product_id')::uuid;
    if not found then raise exception 'product_not_found'; end if;
    if v_p.tracking = 'serialized' then
      select * into v_u from inventory_units where id = (v_item ->> 'unit_id')::uuid and product_id = v_p.id;
      if not found or v_u.branch_id <> p_from or v_u.status <> 'available' or v_u.archived then raise exception 'unit_unavailable'; end if;
      insert into stock_transfer_items(transfer_id, product_id, unit_id, qty) values (v_id, v_p.id, v_u.id, 1);
    else
      v_qty := coalesce((v_item ->> 'qty')::int, 0);
      if v_qty <= 0 then raise exception 'invalid_qty'; end if;
      select qty into v_bal from inventory_balances where product_id = v_p.id and branch_id = p_from;
      if v_bal is null or v_bal < v_qty then raise exception 'insufficient_stock'; end if;
      insert into stock_transfer_items(transfer_id, product_id, qty) values (v_id, v_p.id, v_qty);
    end if;
  end loop;
  perform log_audit(p_from, 'transfer.request', 'stock_transfers', v_id, jsonb_build_object('number', v_num, 'to', p_to));
  return v_id;
end $$;

create or replace function dispatch_transfer(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_t stock_transfers%rowtype; v_i stock_transfer_items%rowtype; v_u inventory_units%rowtype; v_bal int;
begin
  select * into v_t from stock_transfers where id = p_id for update;
  if not found then raise exception 'transfer_not_found'; end if;
  perform assert_access(v_t.from_branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if v_t.status <> 'pending' then raise exception 'transfer_not_pending'; end if;
  for v_i in select * from stock_transfer_items where transfer_id = p_id loop
    if v_i.unit_id is not null then
      select * into v_u from inventory_units where id = v_i.unit_id for update;
      if not found or v_u.branch_id <> v_t.from_branch_id or v_u.status <> 'available' or v_u.archived then raise exception 'unit_unavailable'; end if;
      update inventory_units set status = 'in_transit' where id = v_u.id;
      insert into stock_movements(branch_id, product_id, unit_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_t.from_branch_id, v_i.product_id, v_i.unit_id, 'transfer_out', -1, 'transfer', p_id, v_t.number, auth.uid(), v_t.data_origin);
    else
      select qty into v_bal from inventory_balances where product_id = v_i.product_id and branch_id = v_t.from_branch_id for update;
      if v_bal is null or v_bal < v_i.qty then raise exception 'insufficient_stock'; end if;
      update inventory_balances set qty = qty - v_i.qty where product_id = v_i.product_id and branch_id = v_t.from_branch_id;
      insert into stock_movements(branch_id, product_id, type, qty, ref_type, ref_id, reason, actor_id, data_origin)
      values (v_t.from_branch_id, v_i.product_id, 'transfer_out', -v_i.qty, 'transfer', p_id, v_t.number, auth.uid(), v_t.data_origin);
    end if;
  end loop;
  update stock_transfers set status = 'in_transit' where id = p_id;
  perform log_audit(v_t.from_branch_id, 'transfer.dispatch', 'stock_transfers', p_id, jsonb_build_object('number', v_t.number));
end $$;

-- Pembatalan: Menunggu (stok belum bergerak) atau Dalam Pengiriman (stok dikembalikan ke cabang asal).
create or replace function cancel_transfer(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_t stock_transfers%rowtype; v_i stock_transfer_items%rowtype;
begin
  select * into v_t from stock_transfers where id = p_id for update;
  if not found then raise exception 'transfer_not_found'; end if;
  perform assert_access(v_t.from_branch_id, array['super_admin','branch_admin','inventory_staff']::app_role[]);
  if v_t.status not in ('pending', 'in_transit') then raise exception 'transfer_not_pending'; end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  if v_t.status = 'in_transit' then
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
  end if;
  update stock_transfers set status = 'cancelled', note = coalesce(note || ' | ', '') || 'Batal: ' || btrim(p_reason) where id = p_id;
  perform log_audit(v_t.from_branch_id, 'transfer.cancel', 'stock_transfers', p_id, jsonb_build_object('reason', p_reason));
end $$;

-- ===== Penjualan POS: pembayaran Tunai / Non-Tunai, diskon transaksi, pajak; selalu LUNAS =====
create or replace function create_sale_pos(p_branch uuid, p_customer jsonb, p_items jsonb, p_method text, p_tendered numeric,
                                           p_reference text, p_pay_note text, p_extra_discount numeric, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_sale uuid; v_s sales%rowtype; v_role app_role := auth_role(); v_maxpct numeric; v_taxpct numeric;
        v_extra numeric := coalesce(p_extra_discount, 0); v_tax numeric := 0; v_total numeric; v_cash boolean;
        v_tend numeric; v_change numeric := 0;
begin
  if p_method is null or btrim(p_method) = '' then raise exception 'payment_method_required'; end if;
  v_sale := create_sale(p_branch, p_customer, p_items, btrim(p_method), null, p_notes);
  select * into v_s from sales where id = v_sale for update;
  select coalesce((value #>> '{}')::numeric, 0) into v_maxpct from app_settings where key = 'max_discount_percent';
  v_maxpct := coalesce(v_maxpct, 0);
  if v_extra < 0 or v_extra > v_s.total then raise exception 'invalid_discount'; end if;
  if v_extra > 0 and v_role not in ('super_admin', 'branch_admin') and (v_s.discount + v_extra) > v_s.subtotal * v_maxpct / 100 then
    raise exception 'discount_over_limit';
  end if;
  select coalesce((value #>> '{}')::numeric, 0) into v_taxpct from app_settings where key = 'tax_percent';
  v_taxpct := coalesce(v_taxpct, 0);
  if v_taxpct > 0 then v_tax := round((v_s.total - v_extra) * v_taxpct / 100); end if;
  v_total := v_s.total - v_extra + v_tax;
  v_cash := lower(btrim(p_method)) = 'tunai';
  if v_cash then
    v_tend := coalesce(p_tendered, 0);
    if v_tend < v_total then raise exception 'payment_insufficient'; end if;
    v_change := v_tend - v_total;
  else
    v_tend := v_total;
  end if;
  update sales set discount = discount + v_extra, tax = v_tax, total = v_total, payment_status = 'paid' where id = v_sale;
  delete from payments where sale_id = v_sale;
  insert into payments(sale_id, method, amount, reference, tendered, change_amount, note, data_origin)
  values (v_sale, btrim(p_method), v_total, nullif(btrim(coalesce(p_reference, '')), ''), v_tend, v_change,
          nullif(btrim(coalesce(p_pay_note, '')), ''), v_s.data_origin);
  return v_sale;
end $$;

-- ===== Hak eksekusi =====
revoke execute on function receive_goods(uuid, uuid, text, unit_condition, date, numeric, int, text, text, text),
  issue_stock(uuid, uuid, uuid, int, text, date, text), opname_create(uuid, text), opname_save(uuid, jsonb),
  opname_confirm(uuid), opname_cancel(uuid), request_transfer(uuid, uuid, jsonb, text), dispatch_transfer(uuid),
  cancel_transfer(uuid, text), create_sale_pos(uuid, jsonb, jsonb, text, numeric, text, text, numeric, text), stock_movement_fill()
  from public, anon;
grant execute on function receive_goods(uuid, uuid, text, unit_condition, date, numeric, int, text, text, text),
  issue_stock(uuid, uuid, uuid, int, text, date, text), opname_create(uuid, text), opname_save(uuid, jsonb),
  opname_confirm(uuid), opname_cancel(uuid), request_transfer(uuid, uuid, jsonb, text), dispatch_transfer(uuid),
  cancel_transfer(uuid, text), create_sale_pos(uuid, jsonb, jsonb, text, numeric, text, text, numeric, text) to authenticated;
