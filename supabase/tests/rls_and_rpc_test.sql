-- Tes RLS + RPC. JALANKAN di staging/SQL Editor SETELAH migration + seed 00/01/02.
-- Seluruh skrip berada dalam transaksi dan di-ROLLBACK di akhir (tidak mengubah data).
-- Setiap blok DO memakai ASSERT; kegagalan = error. Belum dijalankan otomatis di lingkungan penyusun.
begin;

-- ===== Data uji =====
insert into auth.users(id, email) values
 ('aaaaaaaa-0000-0000-0000-000000000001','t-super@test.local'),
 ('aaaaaaaa-0000-0000-0000-000000000002','t-cdl-admin@test.local'),
 ('aaaaaaaa-0000-0000-0000-000000000003','t-cdl-sales@test.local'),
 ('aaaaaaaa-0000-0000-0000-000000000004','t-demo-admin@test.local'),
 ('aaaaaaaa-0000-0000-0000-000000000005','t-hr@test.local');
insert into profiles(id, full_name, role) values
 ('aaaaaaaa-0000-0000-0000-000000000001','T Super','super_admin'),
 ('aaaaaaaa-0000-0000-0000-000000000002','T CDL Admin','branch_admin'),
 ('aaaaaaaa-0000-0000-0000-000000000003','T CDL Sales','sales'),
 ('aaaaaaaa-0000-0000-0000-000000000004','T Demo Admin','branch_admin'),
 ('aaaaaaaa-0000-0000-0000-000000000005','T HR','hr');
insert into user_branch_access(user_id, branch_id)
 select 'aaaaaaaa-0000-0000-0000-000000000002', id from branches where code='CDL'
 union all select 'aaaaaaaa-0000-0000-0000-000000000003', id from branches where code='CDL'
 union all select 'aaaaaaaa-0000-0000-0000-000000000004', id from branches where code='CLD'
 union all select 'aaaaaaaa-0000-0000-0000-000000000005', id from branches where code='CDL';

-- ===== 1. Isolasi cabang =====
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  assert (select count(*) from inventory_units where data_origin='demo') = 0, 'Admin CDL tidak boleh melihat unit demo';
  assert (select count(*) from inventory_units) = 49, 'Admin CDL harus melihat 49 unit Cidodol';
  assert (select count(*) from sales where data_origin='demo') = 0, 'Admin CDL tidak boleh melihat penjualan demo';
  assert (select count(*) from branches) = 1, 'Admin CDL hanya melihat 1 cabang';
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000004","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  assert (select count(*) from inventory_units where branch_id in (select id from branches where code='CDL')) = 0, 'Admin demo tidak boleh melihat Cidodol';
end $$;
reset role;

select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin assert (select count(*) from branches) = 6, 'Super Admin melihat 6 cabang'; end $$;
reset role;

-- ===== 2. HR tidak boleh membaca data operasional =====
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}',true);
set local role authenticated;
do $$ begin assert (select count(*) from inventory_units) = 0, 'HR tidak boleh membaca unit'; end $$;
reset role;

-- ===== 3. Tulis langsung ke tabel kritis ditolak =====
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ declare n int; denied boolean := false; v_b uuid; v_p uuid; begin
  update inventory_units set serial_number = 'HACK-SN';
  get diagnostics n = row_count;
  assert n = 0, 'UPDATE langsung inventory_units harus 0 baris (tanpa policy tulis)';
  update sales set total = 1;
  get diagnostics n = row_count;
  assert n = 0, 'UPDATE langsung sales harus 0 baris';
  select id into v_b from branches where code = 'CDL'; select id into v_p from products where sku = 'LTP-0003';
  begin
    insert into inventory_units(product_id, branch_id, internal_asset_code) values (v_p, v_b, 'UNIT-HACK-1');
  exception when others then denied := true; end;
  assert denied, 'INSERT langsung inventory_units harus ditolak RLS';
end $$;
reset role;

-- ===== 4. Penjualan: tidak bisa dijual dua kali, diskon dibatasi, stok konsisten =====
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$
declare v_b uuid; v_u uuid; v_p uuid; v_sale uuid; v_acc uuid; v_n int;
begin
  select id into v_b from branches where code='CDL';
  select id, product_id into v_u, v_p from inventory_units where branch_id=v_b and status='available' limit 1;
  v_sale := create_sale(v_b, '{"name":"Uji"}', jsonb_build_array(jsonb_build_object('product_id',v_p,'unit_id',v_u,'qty',1,'unit_price',1000000,'discount',0)), 'Tunai', null, null);
  assert (select status from inventory_units where id=v_u) = 'sold', 'unit harus berstatus sold';
  begin
    perform create_sale(v_b, '{}', jsonb_build_array(jsonb_build_object('product_id',v_p,'unit_id',v_u,'qty',1,'unit_price',1000000,'discount',0)), 'Tunai', null, null);
    assert false, 'penjualan kedua unit yang sama harus gagal';
  exception when others then assert sqlerrm like '%unit_unavailable%', 'harus unit_unavailable, dapat: '||sqlerrm; end;
  -- diskon > batas (0%) untuk role sales
  select id, product_id into v_u, v_p from inventory_units where branch_id=v_b and status='available' limit 1;
  begin
    perform create_sale(v_b, '{}', jsonb_build_array(jsonb_build_object('product_id',v_p,'unit_id',v_u,'qty',1,'unit_price',1000000,'discount',50000)), 'Tunai', null, null);
    assert false, 'diskon di atas batas harus ditolak';
  exception when others then assert sqlerrm like '%discount_over_limit%', 'harus discount_over_limit: '||sqlerrm; end;
  assert (select status from inventory_units where id=v_u) = 'available', 'transaksi gagal tidak boleh mengubah unit';
  -- aksesori: jual melebihi stok ditolak
  select product_id into v_acc from inventory_balances where branch_id=v_b and qty>0 limit 1;
  begin
    perform create_sale(v_b, '{}', jsonb_build_array(jsonb_build_object('product_id',v_acc,'qty',9999,'unit_price',1000,'discount',0)), 'Tunai', null, null);
    assert false, 'penjualan melebihi stok harus gagal';
  exception when others then assert sqlerrm like '%insufficient_stock%', 'harus insufficient_stock: '||sqlerrm; end;
end $$;
reset role;

-- ===== 5. Void mengembalikan unit; sales tidak boleh void =====
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
do $$ declare v_s uuid; begin
  select id into v_s from sales where cashier_id='aaaaaaaa-0000-0000-0000-000000000003' limit 1;
  begin perform void_sale(v_s,'uji'); assert false,'sales tidak boleh void'; exception when others then assert sqlerrm like '%forbidden_role%','harus forbidden_role: '||sqlerrm; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ declare v_s uuid; v_u uuid; begin
  select id into v_s from sales where cashier_id='aaaaaaaa-0000-0000-0000-000000000003' limit 1;
  select unit_id into v_u from sale_items where sale_id=v_s limit 1;
  perform void_sale(v_s,'uji void');
  assert (select status from inventory_units where id=v_u)='available','unit kembali available setelah void';
  perform create_sale((select branch_id from sales where id=v_s), '{}', jsonb_build_array(jsonb_build_object('product_id',(select product_id from inventory_units where id=v_u),'unit_id',v_u,'qty',1,'unit_price',900000,'discount',0)), 'Tunai', null, null);
  assert (select status from inventory_units where id=v_u)='sold','unit dapat dijual lagi setelah void';
end $$;
reset role;

-- ===== 6. Penyesuaian stok tidak boleh negatif =====
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ declare v_b uuid; v_p uuid; begin
  select id into v_b from branches where code='CDL';
  select product_id into v_p from inventory_balances where branch_id=v_b and qty>0 limit 1;
  begin perform adjust_stock(v_p, v_b, -100000, 'uji'); assert false,'stok negatif harus ditolak'; exception when others then assert sqlerrm like '%negative_stock%','harus negative_stock: '||sqlerrm; end;
end $$;
reset role;

-- ===== 7. Transfer: konsistensi & larangan lintas real/demo =====
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare v_a uuid; v_b uuid; v_u uuid; v_p uuid; v_t uuid; begin
  select id into v_a from branches where code='CDL'; select id into v_b from branches where code='CLD';
  select id, product_id into v_u, v_p from inventory_units where branch_id=v_a and status='available' limit 1;
  begin perform create_transfer(v_a, v_b, jsonb_build_array(jsonb_build_object('product_id',v_p,'unit_id',v_u)), null); assert false,'transfer real->demo harus ditolak';
  exception when others then assert sqlerrm like '%cross_origin_transfer%','harus cross_origin_transfer: '||sqlerrm; end;
  -- transfer antar-demo
  select id into v_a from branches where code='MRY'; select id into v_b from branches where code='PMG';
  select id, product_id into v_u, v_p from inventory_units where branch_id=v_a and status='available' limit 1;
  v_t := create_transfer(v_a, v_b, jsonb_build_array(jsonb_build_object('product_id',v_p,'unit_id',v_u)), 'uji');
  assert (select status from inventory_units where id=v_u)='in_transit','unit in_transit';
  assert (select branch_id from inventory_units where id=v_u)=v_a,'masih di cabang asal sebelum diterima';
  perform receive_transfer(v_t);
  assert (select branch_id from inventory_units where id=v_u)=v_b,'pindah ke cabang tujuan setelah diterima';
  assert (select status from inventory_units where id=v_u)='available','available di tujuan';
end $$;
reset role;

-- ===== 8. Nomor seri unik =====
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ declare v_b uuid; v_p uuid; v_id uuid; begin
  select id into v_b from branches where code='CDL';
  select id into v_p from products where sku='LTP-0003';
  v_id := receive_unit(v_p, v_b, 'sn-uji-001', 'bekas_baik', null, null, null);
  begin perform receive_unit(v_p, v_b, 'SN-UJI-001', 'bekas_baik', null, null, null); assert false,'serial ganda harus ditolak';
  exception when others then assert sqlerrm like '%serial_duplicate%','harus serial_duplicate: '||sqlerrm; end;
end $$;
reset role;

-- ===== 9. Data Cidodol tidak tertukar demo =====
do $$ begin
  assert (select count(*) from inventory_units where data_origin='demo' and branch_id in (select id from branches where code='CDL')) = 0, 'Cidodol tidak boleh punya unit demo';
  assert (select count(*) from products where sku in ('LTP-0001') ) = 1, 'SKU unik';
end $$;

rollback;
select 'SEMUA TES LULUS (transaksi di-rollback)' as hasil;
