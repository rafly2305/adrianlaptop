-- 0008_single_location_pos.sql
-- Tujuan:
--   1. Aplikasi hanya untuk satu lokasi operasional (Cidodol): data demo & cabang demo dibersihkan dengan aman.
--   2. POS: diskon & pajak dalam PERSEN, dihitung di database (pembulatan ke rupiah), nominal tersimpan = nominal tampil.
--   3. POS: harga satuan selalu diambil dari database (klien tidak bisa memanipulasi harga).
--   4. POS: metode Tunai / QRIS / Transfer Bank / Kartu Debit (E-Wallet dihapus), pembayaran non-tunai wajib diverifikasi kasir.
--   5. POS: kunci idempotensi (request_id) agar klik ganda / kirim ulang tidak membuat transaksi ganda.
-- Aman dijalankan pada data yang sudah ada. Data Cidodol (data_origin = 'real') TIDAK disentuh.
-- Jalankan SETELAH 0007_inventory_pos.sql, satu kali, lewat Supabase -> SQL Editor.

begin;

-- ===== 1. Kolom baru =====
alter table sales add column if not exists discount_percent numeric(5,2) not null default 0
  check (discount_percent >= 0 and discount_percent <= 100);
alter table sales add column if not exists tax_percent numeric(5,2) not null default 0
  check (tax_percent >= 0 and tax_percent <= 100);
alter table sales add column if not exists request_id uuid;
create unique index if not exists sales_request_id_uq on sales (request_id) where request_id is not null;

alter table payments add column if not exists verified_by uuid references profiles(id);
alter table payments add column if not exists verified_at timestamptz;

-- ===== 2. Pengaturan: metode pembayaran tetap + konfigurasi QRIS & rekening (diisi admin, tidak ada data karangan) =====
insert into app_settings(key, value) values ('payment_methods', '["Tunai","QRIS","Transfer Bank","Kartu Debit"]'::jsonb)
  on conflict (key) do update set value = excluded.value;
insert into app_settings(key, value) values ('qris_image_url', '""'::jsonb) on conflict (key) do nothing;
insert into app_settings(key, value) values ('qris_merchant_name', '""'::jsonb) on conflict (key) do nothing;
insert into app_settings(key, value) values ('bank_accounts', '[]'::jsonb) on conflict (key) do nothing;

-- ===== 3. Pembersihan data demo (hanya baris data_origin = 'demo' dan cabang demo) =====
-- Stok opname demo dihapus lebih dulu karena merujuk unit demo.
delete from stock_opname_items where opname_id in (select id from stock_opnames where data_origin = 'demo');
delete from stock_opnames where data_origin = 'demo';
select _reset_demo();   -- transaksi, stok, unit, pelanggan, tiket, garansi, transfer milik cabang demo
update profiles set default_branch_id = null where default_branch_id in (select id from branches where is_demo);
delete from user_branch_access where branch_id in (select id from branches where is_demo);
delete from audit_logs where branch_id in (select id from branches where is_demo);
delete from branches where is_demo;
drop function if exists reset_demo_data();
drop function if exists _reset_demo();

-- ===== 4. Transaksi POS baru =====
drop function if exists create_sale_pos(uuid, jsonb, jsonb, text, numeric, text, text, numeric, text);

create or replace function create_sale_pos(
  p_branch uuid, p_customer jsonb, p_items jsonb, p_method text, p_tendered numeric,
  p_reference text, p_pay_note text, p_discount_percent numeric, p_tax_percent numeric,
  p_verified boolean, p_request_id uuid, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role app_role := auth_role();
  v_admin boolean := auth_role() in ('super_admin', 'branch_admin');
  v_method text := btrim(coalesce(p_method, ''));
  v_dp numeric := coalesce(p_discount_percent, 0);
  v_tp numeric := coalesce(p_tax_percent, 0);
  v_maxpct numeric; v_cfgtax numeric; v_banks jsonb;
  v_existing uuid; v_sale uuid; v_s sales%rowtype; v_item jsonb; v_p products%rowtype; v_items jsonb := '[]'::jsonb;
  v_disc numeric; v_after numeric; v_tax numeric; v_total numeric; v_tend numeric; v_change numeric := 0;
  v_ref text := nullif(btrim(coalesce(p_reference, '')), ''); v_note text := nullif(btrim(coalesce(p_pay_note, '')), '');
begin
  perform assert_access(p_branch, array['super_admin', 'branch_admin', 'sales']::app_role[]);

  -- Idempotensi: permintaan yang sama (klik ganda / kirim ulang) mengembalikan transaksi yang sudah ada.
  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtext(p_request_id::text));
    select id into v_existing from sales where request_id = p_request_id;
    if v_existing is not null then return v_existing; end if;
  end if;

  if v_method = '' then raise exception 'payment_method_required'; end if;
  if v_method not in ('Tunai', 'QRIS', 'Transfer Bank', 'Kartu Debit') then raise exception 'invalid_payment_method'; end if;
  if v_dp < 0 or v_dp > 100 or v_tp < 0 or v_tp > 100 or v_dp <> round(v_dp, 2) or v_tp <> round(v_tp, 2) then
    raise exception 'invalid_percent';
  end if;

  select coalesce((value #>> '{}')::numeric, 0) into v_maxpct from app_settings where key = 'max_discount_percent';
  select coalesce((value #>> '{}')::numeric, 0) into v_cfgtax from app_settings where key = 'tax_percent';
  v_maxpct := coalesce(v_maxpct, 0); v_cfgtax := coalesce(v_cfgtax, 0);
  -- Kasir: diskon dibatasi pengaturan; pajak harus sama dengan tarif toko. Admin boleh mengatur keduanya.
  if not v_admin then
    if v_dp > v_maxpct then raise exception 'discount_over_limit'; end if;
    if v_tp <> v_cfgtax then raise exception 'tax_not_allowed'; end if;
  end if;

  -- Aturan per metode pembayaran
  if v_method <> 'Tunai' and not coalesce(p_verified, false) then raise exception 'payment_not_verified'; end if;
  if v_method = 'Transfer Bank' then
    select value into v_banks from app_settings where key = 'bank_accounts';
    if v_banks is null or jsonb_typeof(v_banks) <> 'array' or jsonb_array_length(v_banks) = 0 then raise exception 'bank_not_configured'; end if;
    if (v_ref is null or length(v_ref) < 3) and (v_note is null or length(v_note) < 3) then raise exception 'reference_required'; end if;
  end if;
  if v_method = 'Kartu Debit' and (v_ref is null or length(v_ref) < 4) then raise exception 'approval_required'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'empty_cart'; end if;

  -- Harga satuan SELALU dari database; diskon per-item tidak dipakai (diskon hanya persen pada transaksi).
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_p from products where id = (v_item ->> 'product_id')::uuid and not archived;
    if not found then raise exception 'product_not_found'; end if;
    if v_p.default_price is null or v_p.default_price <= 0 or v_p.default_price <> trunc(v_p.default_price) then raise exception 'price_not_set'; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_p.id, 'unit_id', v_item ->> 'unit_id', 'qty', coalesce((v_item ->> 'qty')::int, 1),
      'unit_price', v_p.default_price, 'discount', 0));
  end loop;

  v_sale := create_sale(p_branch, p_customer, v_items, v_method, null, p_notes);
  select * into v_s from sales where id = v_sale for update;

  v_disc := round(v_s.subtotal * v_dp / 100);          -- pembulatan ke rupiah terdekat
  v_after := v_s.subtotal - v_disc;
  v_tax := round(v_after * v_tp / 100);
  v_total := v_after + v_tax;

  if v_method = 'Tunai' then
    v_tend := coalesce(p_tendered, 0);
    if v_tend < v_total then raise exception 'payment_insufficient'; end if;
    v_change := v_tend - v_total;
  else
    v_tend := v_total;
  end if;

  update sales set discount = v_disc, discount_percent = v_dp, tax = v_tax, tax_percent = v_tp, total = v_total,
         payment_status = 'paid', request_id = p_request_id
   where id = v_sale;
  delete from payments where sale_id = v_sale;
  insert into payments(sale_id, method, amount, reference, tendered, change_amount, note, verified_by, verified_at, data_origin)
  values (v_sale, v_method, v_total, v_ref, v_tend, v_change, v_note, auth.uid(), now(), v_s.data_origin);
  perform log_audit(p_branch, 'sale.pos', 'sales', v_sale,
    jsonb_build_object('invoice', v_s.invoice_no, 'method', v_method, 'discount_percent', v_dp, 'tax_percent', v_tp, 'total', v_total));
  return v_sale;
end $$;

revoke execute on function create_sale_pos(uuid, jsonb, jsonb, text, numeric, text, text, numeric, numeric, boolean, uuid, text) from public, anon;
grant execute on function create_sale_pos(uuid, jsonb, jsonb, text, numeric, text, text, numeric, numeric, boolean, uuid, text) to authenticated;

-- Hardening: create_sale menerima harga dari pemanggil, jadi tidak boleh dipanggil langsung lewat API oleh pengguna.
-- create_sale_pos (security definer) tetap dapat memanggilnya dan selalu memakai harga dari tabel products.
revoke execute on function create_sale(uuid, jsonb, jsonb, text, numeric, text) from public, anon, authenticated;

commit;

-- Cek hasil (jalankan manual):
--   select code, name, is_demo from branches;                         -- hanya Cidodol
--   select count(*) from inventory_units where data_origin = 'demo';  -- 0
--   select sku, name, default_price from products where default_price is null or default_price = 0;  -- sebaiknya 0 baris
