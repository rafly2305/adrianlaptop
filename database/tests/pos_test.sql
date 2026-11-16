-- Tes aturan POS (create_sale_pos). OPSIONAL: jalankan di project Supabase UJI (bukan produksi) SETELAH LANGKAH 1-4.
-- Seluruh skrip di dalam transaksi dan di-ROLLBACK di akhir (data Cidodol tidak berubah).
-- Setiap blok memakai ASSERT; kegagalan = error. BELUM dijalankan di lingkungan penyusun (tidak ada PostgreSQL).
begin;

insert into auth.users(id, email) values
 ('aaaaaaaa-0000-0000-0000-000000000001', 't-admin@test.local'),
 ('aaaaaaaa-0000-0000-0000-000000000002', 't-kasir@test.local');
insert into profiles(id, full_name, role) values
 ('aaaaaaaa-0000-0000-0000-000000000001', 'T Admin', 'branch_admin'),
 ('aaaaaaaa-0000-0000-0000-000000000002', 'T Kasir', 'sales');
insert into user_branch_access(user_id, branch_id)
 select u.id, b.id from (values ('aaaaaaaa-0000-0000-0000-000000000001'::uuid), ('aaaaaaaa-0000-0000-0000-000000000002'::uuid)) u(id), branches b where b.code = 'CDL';

create temp table t_ctx as
  select b.id as branch, un.id as unit, un.product_id as product, p.default_price as price
  from branches b join inventory_units un on un.branch_id = b.id and un.status = 'available'
  join products p on p.id = un.product_id
  where b.code = 'CDL' and p.default_price > 0 order by un.id limit 3;
grant all on t_ctx to public;

create function pg_temp.items(p_unit uuid, p_prod uuid) returns jsonb language sql as
  $$ select jsonb_build_array(jsonb_build_object('product_id', p_prod, 'unit_id', p_unit, 'qty', 1, 'unit_price', 1, 'discount', 999999999)) $$;

-- 1. Admin: diskon 10% + pajak 11% dihitung di database; harga dari tabel products (nilai klien diabaikan)
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ declare c record; v_sale uuid; s sales%rowtype; v_d numeric; v_t numeric;
begin
  select * into c from t_ctx offset 0 limit 1;
  v_sale := create_sale_pos(c.branch, '{"name":"Uji"}', pg_temp.items(c.unit, c.product), 'Tunai', c.price * 2, null, null, 10, 11, true, 'bbbbbbbb-0000-0000-0000-000000000001', null);
  select * into s from sales where id = v_sale;
  v_d := round(c.price * 10 / 100); v_t := round((c.price - v_d) * 11 / 100);
  assert s.subtotal = c.price, 'subtotal harus memakai harga database, bukan harga klien';
  assert s.discount = v_d and s.discount_percent = 10, 'diskon persen salah';
  assert s.tax = v_t and s.tax_percent = 11, 'pajak persen salah';
  assert s.total = c.price - v_d + v_t, 'total salah';
  assert s.payment_status = 'paid', 'status harus paid';
  assert (select amount from payments where sale_id = v_sale) = s.total, 'nominal pembayaran harus = total';
  -- 2. Idempotensi: request_id sama tidak membuat transaksi ganda
  assert create_sale_pos(c.branch, '{}', pg_temp.items(c.unit, c.product), 'Tunai', c.price * 2, null, null, 10, 11, true, 'bbbbbbbb-0000-0000-0000-000000000001', null) = v_sale, 'request_id sama harus mengembalikan transaksi yang sama';
  assert (select count(*) from sales where request_id = 'bbbbbbbb-0000-0000-0000-000000000001') = 1, 'transaksi ganda';
end $$;

-- 3. Validasi (setiap kasus harus ditolak dengan kode yang diharapkan)
create function pg_temp.expect(p_code text, p_method text, p_tend numeric, p_ref text, p_dp numeric, p_tp numeric, p_ver boolean) returns void language plpgsql as $$
declare c record;
begin
  select * into c from t_ctx offset 1 limit 1;
  begin
    perform create_sale_pos(c.branch, '{}', pg_temp.items(c.unit, c.product), p_method, p_tend, p_ref, null, p_dp, p_tp, p_ver, gen_random_uuid(), null);
    raise exception 'TIDAK DITOLAK: %', p_code;
  exception when others then
    if sqlerrm <> p_code then raise exception 'diharapkan %, didapat %', p_code, sqlerrm; end if;
  end;
end $$;
select pg_temp.expect('invalid_percent', 'Tunai', 99999999999, null, 101, 0, true);
select pg_temp.expect('invalid_percent', 'Tunai', 99999999999, null, -1, 0, true);
select pg_temp.expect('invalid_percent', 'Tunai', 99999999999, null, 0, 100.5, true);
select pg_temp.expect('invalid_payment_method', 'E-Wallet', null, null, 0, 0, true);
select pg_temp.expect('payment_insufficient', 'Tunai', 1, null, 0, 0, true);
select pg_temp.expect('payment_not_verified', 'QRIS', null, null, 0, 0, false);
select pg_temp.expect('approval_required', 'Kartu Debit', null, null, 0, 0, true);
select pg_temp.expect('payment_not_verified', 'Kartu Debit', null, 'AP1234', 0, 0, false);

-- 4. Kasir (role sales): diskon di atas batas & pajak selain tarif toko ditolak
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', true);
update app_settings set value = '0'::jsonb where key in ('max_discount_percent', 'tax_percent');
select pg_temp.expect('discount_over_limit', 'Tunai', 99999999999, null, 5, 0, true);
select pg_temp.expect('tax_not_allowed', 'Tunai', 99999999999, null, 0, 11, true);

rollback;
