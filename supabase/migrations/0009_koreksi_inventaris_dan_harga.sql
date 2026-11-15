-- 0009_koreksi_inventaris_dan_harga.sql (dibuat oleh scripts/gen_seed.py)
-- Menyelaraskan nama/spesifikasi produk Cidodol dengan daftar inventaris asli (gambar daftar terbaru) dan mengisi harga estimasi barang bekas.
-- Aman untuk data yang sudah ada: SKU & id produk dipertahankan, nomor seri/transaksi tidak diubah, harga hasil edit manual tidak ditimpa.
-- Jalankan SETELAH 0008, sekali, di Supabase SQL Editor.
begin;
-- 1. Baris 4 pada daftar = L14 i5-10210U 8/256 TOUCHSCREEN (berbeda dari baris 5 yang NO TOUCHSCREEN) -> produk baru LTP-0023.
insert into products(sku,name,original_name,brand,model,category_id,tracking,processor,ram_gb,storage,touchscreen,specs,needs_verification,source_ref)
select 'LTP-0023', name, original_name, brand, model, category_id, tracking, processor, ram_gb, storage, true, specs, false, '4' from products where sku = 'LTP-0003'
  and not exists (select 1 from products where sku = 'LTP-0023');
do $$ declare v_old uuid; v_new uuid; v_u uuid; begin
  select id into v_old from products where sku = 'LTP-0003'; select id into v_new from products where sku = 'LTP-0023';
  select id into v_u from inventory_units where internal_asset_code = 'UNIT-CDL-000004' and product_id = v_old;
  if v_u is not null and v_new is not null and not exists (select 1 from sale_items where unit_id = v_u) then
    update inventory_units set product_id = v_new where id = v_u;
    update stock_movements set product_id = v_new where unit_id = v_u;
  end if;
  -- 2. Baris 9 = THINKPAD L13 YOGA (sama dengan baris 10), bukan produk 'Think Yoga' terpisah: gabungkan LTP-0006 -> LTP-0007.
  select id into v_old from products where sku = 'LTP-0006'; select id into v_new from products where sku = 'LTP-0007';
  select id into v_u from inventory_units where internal_asset_code = 'UNIT-CDL-000009' and product_id = v_old;
  if v_u is not null and v_new is not null and not exists (select 1 from sale_items where unit_id = v_u) then
    update inventory_units set product_id = v_new where id = v_u;
    update stock_movements set product_id = v_new where unit_id = v_u;
  end if;
  if v_old is not null and not exists (select 1 from inventory_units where product_id = v_old) then
    update products set archived = true where id = v_old;
  end if;
end $$;
-- 3. Nama & spesifikasi sesuai daftar asli (harga tidak diubah di langkah ini).
update products set name='Lenovo ThinkPad L14 Intel Core i5-10310U 8GB/256 Touchscreen', original_name='LENOVO THINKPAD L14 i5-10310U 8/256 TOUCHSCREEN', brand='Lenovo', model='ThinkPad L14', processor='Intel Core i5-10310U', ram_gb=8, storage='256 GB', touchscreen=true, needs_verification=false, source_ref='1,2' where sku='LTP-0001';
update inventory_units set source_raw='LENOVO THINKPAD L14 i5-10310U 8/256 TOUCHSCREEN', notes=NULL where internal_asset_code='UNIT-CDL-000001';
update inventory_units set source_raw='LENOVO THINKPAD L14 i5-10310U 8/256 TOUCHSCREEN', notes=NULL where internal_asset_code='UNIT-CDL-000002';
update products set name='Lenovo ThinkPad L14 Intel Core i5-10210U 16GB/256', original_name='LENOVO THINKPAD L14 i5-10210U 16/256 NO TOUCHSCREEN', brand='Lenovo', model='ThinkPad L14', processor='Intel Core i5-10210U', ram_gb=16, storage='256 GB', touchscreen=false, needs_verification=false, source_ref='3,50' where sku='LTP-0002';
update inventory_units set source_raw='LENOVO THINKPAD L14 i5-10210U 16/256 NO TOUCHSCREEN', notes=NULL where internal_asset_code='UNIT-CDL-000003';
update inventory_units set source_raw='LENOVO THINKPAD L14 i5-10210U 16/256 NO TOUCHSCREEN', notes=NULL where internal_asset_code='UNIT-CDL-000049';
update products set name='Lenovo ThinkPad L14 Intel Core i5-10210U 8GB/256 Touchscreen', original_name='LENOVO THINKPAD L14 i5-10210U 8/256 TOUCHSCREEN', brand='Lenovo', model='ThinkPad L14', processor='Intel Core i5-10210U', ram_gb=8, storage='256 GB', touchscreen=true, needs_verification=false, source_ref='4' where sku='LTP-0023';
update inventory_units set source_raw='LENOVO THINKPAD L14 i5-10210U 8/256 TOUCHSCREEN', notes='Daftar baris 4 tertulis TOUCHSCREEN (baris 5 NO TOUCHSCREEN).' where internal_asset_code='UNIT-CDL-000004';
update products set name='Lenovo ThinkPad L14 Intel Core i5-10210U 8GB/256', original_name='LENOVO THINKPAD L14 i5-10210U 8/256 NO TOUCHSCREEN', brand='Lenovo', model='ThinkPad L14', processor='Intel Core i5-10210U', ram_gb=8, storage='256 GB', touchscreen=false, needs_verification=false, source_ref='5' where sku='LTP-0003';
update inventory_units set source_raw='LENOVO THINKPAD L14 i5-10210U 8/256 NO TOUCHSCREEN', notes=NULL where internal_asset_code='UNIT-CDL-000005';
update products set name='Lenovo (model tidak disebut) Intel Core i5-10310U 8GB/256 Touchscreen', original_name='LENOVO THINKPAD 8/256 i5-10310U 8/256 TOUCHSCREEN', brand='Lenovo', model=NULL, processor='Intel Core i5-10310U', ram_gb=8, storage='256 GB', touchscreen=true, needs_verification=true, source_ref='6' where sku='LTP-0004';
update inventory_units set source_raw='LENOVO THINKPAD 8/256 i5-10310U 8/256 TOUCHSCREEN', notes='Model tidak disebut pada daftar (tertulis ''THINKPAD 8/256''); nomor seri/model perlu dicek fisik. [PERLU VERIFIKASI]' where internal_asset_code='UNIT-CDL-000006';
update products set name='Microsoft Surface 1951 Intel Core i5-1145G7 8GB/512 Touchscreen', original_name='MICROSOFT SURFACE 1951 i5-1145G7 W11 8/512 TOUCHSCREEN', brand='Microsoft', model='Surface 1951', processor='Intel Core i5-1145G7', ram_gb=8, storage='512 GB', touchscreen=true, needs_verification=false, source_ref='7,8' where sku='LTP-0005';
update inventory_units set source_raw='MICROSOFT SURFACE 1951 i5-1145G7 W11 8/512 TOUCHSCREEN', notes='''W11'' pada daftar = Windows 11.' where internal_asset_code='UNIT-CDL-000007';
update inventory_units set source_raw='MICROSOFT SURFACE 1951 i5-1145G7 W11 8/512 TOUCHSCREEN', notes='''W11'' pada daftar = Windows 11.' where internal_asset_code='UNIT-CDL-000008';
update products set name='Lenovo ThinkPad L13 Yoga Intel Core i3-10110U 4GB/128 Touchscreen', original_name='LENOVO THINKPAD L13 YOGA i3-10110U 4/128 TOUCHSCREEN', brand='Lenovo', model='ThinkPad L13 Yoga', processor='Intel Core i3-10110U', ram_gb=4, storage='128 GB', touchscreen=true, needs_verification=false, source_ref='9,10,36,37,38' where sku='LTP-0007';
update inventory_units set source_raw='LENOVO THINKPAD L13 YOGA i3-10110U 4/128 TOUCHSCREEN', notes='Daftar tertulis THINKPAD L13 YOGA (sama dengan baris 10).' where internal_asset_code='UNIT-CDL-000009';
update inventory_units set source_raw='LENOVO THINKPAD L13 YOGA i3-10110U 4/128 TOUCHSCREEN', notes=NULL where internal_asset_code='UNIT-CDL-000010';
update inventory_units set source_raw='LENOVO THINKPAD L13 YOGA INTEL CORE i3-10110U 4/128 TOUCHSCREEN FLIP', notes='Touchscreen flip' where internal_asset_code='UNIT-CDL-000035';
update inventory_units set source_raw='LENOVO THINKPAD L13 YOGA INTEL CORE i3-10110U 4/128 TOUCHSCREEN FLIP', notes='Touchscreen flip' where internal_asset_code='UNIT-CDL-000036';
update inventory_units set source_raw='LENOVO THINKPAD L13 YOGA INTEL CORE i3-10110U 4/128 TOUCHSCREEN FLIP', notes='Touchscreen flip' where internal_asset_code='UNIT-CDL-000037';
update products set name='Acer TravelMate P633 Intel Core i5 Gen 3 4GB/HDD 320', original_name='ACER TRAVELMATE P633 i5 GEN 3 4/HDD320 14INCH', brand='Acer', model='TravelMate P633', processor='Intel Core i5 Gen 3', ram_gb=4, storage='HDD 320 GB', touchscreen=false, needs_verification=false, source_ref='11,12,13' where sku='LTP-0008';
update inventory_units set source_raw='ACER TRAVELMATE P633 i5 GEN 3 4/HDD320 14INCH', notes='Layar 14 inci.' where internal_asset_code='UNIT-CDL-000011';
update inventory_units set source_raw='ACER TRAVELMATE P633 i5 GEN 3 4/HDD320 14INCH', notes='Layar 14 inci.' where internal_asset_code='UNIT-CDL-000012';
update inventory_units set source_raw='ACER TRAVELMATE P633 i5 GEN 3 4/HDD320 14INCH', notes='Layar 14 inci.' where internal_asset_code='UNIT-CDL-000013';
update products set name='Acer TravelMate P247M Intel Core i3 Gen 5 4GB/128', original_name='ACER TRAVELMATE P247M i3 GEN 5 4/128', brand='Acer', model='TravelMate P247M', processor='Intel Core i3 Gen 5', ram_gb=4, storage='128 GB', touchscreen=false, needs_verification=false, source_ref='14,15,16' where sku='LTP-0009';
update inventory_units set source_raw='ACER TRAVELMATE P247M i3 GEN 5 4/128', notes=NULL where internal_asset_code='UNIT-CDL-000014';
update inventory_units set source_raw='ACER TRAVELMATE P247M i3 GEN 5 4/128', notes=NULL where internal_asset_code='UNIT-CDL-000015';
update inventory_units set source_raw='ACER TRAVELMATE P247M i3 GEN 5 4/128', notes=NULL where internal_asset_code='UNIT-CDL-000016';
update products set name='Lenovo 300e Chromebook Intel Celeron N4020 4GB/32', original_name='LENOVO 300E CHROMEBOOK N4020 4/32', brand='Lenovo', model='300e Chromebook', processor='Intel Celeron N4020', ram_gb=4, storage='32 GB', touchscreen=false, needs_verification=false, source_ref='17' where sku='LTP-0010';
update inventory_units set source_raw='LENOVO 300E CHROMEBOOK N4020 4/32', notes='Daftar tidak menyebut layar sentuh; diisi ''Tidak''.' where internal_asset_code='UNIT-CDL-000017';
update products set name='Zyrex Bunaken Black Intel Celeron N4020 4GB/256', original_name='ZYREX BUNAKEN BLACK N4020 4/256', brand='Zyrex', model='Bunaken Black', processor='Intel Celeron N4020', ram_gb=4, storage='256 GB', touchscreen=false, needs_verification=false, source_ref='18' where sku='LTP-0011';
update inventory_units set source_raw='ZYREX BUNAKEN BLACK N4020 4/256', notes=NULL where internal_asset_code='UNIT-CDL-000018';
update products set name='Lenovo IdeaPad 1 11ADA05 AMD (Radeon Graphics) 4GB/256', original_name='LENOVO IDEAPAD 1 11ADA05 AMD REDEON GRAPICH 4/256 GEN11', brand='Lenovo', model='IdeaPad 1 11ADA05', processor='AMD (Radeon Graphics)', ram_gb=4, storage='256 GB', touchscreen=false, needs_verification=true, source_ref='19' where sku='LTP-0012';
update inventory_units set source_raw='LENOVO IDEAPAD 1 11ADA05 AMD REDEON GRAPICH 4/256 GEN11', notes='Daftar tertulis ''GEN11'' (arti tidak jelas); ejaan ''REDEON GRAPICH'' sesuai daftar asli. [PERLU VERIFIKASI]' where internal_asset_code='UNIT-CDL-000019';
update products set name='Advan (model tidak disebut) Intel Celeron N4020', original_name='ADVAN CELERON N4020', brand='Advan', model=NULL, processor='Intel Celeron N4020', ram_gb=NULL, storage=NULL, touchscreen=false, needs_verification=true, source_ref='21' where sku='LTP-0013';
update inventory_units set source_raw='ADVAN CELERON N4020', notes='Tertulis hanya ''ADVAN CELERON N4020''; nama model, RAM, dan storage tidak disebut. [PERLU VERIFIKASI]' where internal_asset_code='UNIT-CDL-000020';
update products set name='Advan Workpro 1710 Lite Intel Core i3 Gen 12 8GB/256', original_name='ADVAN WORKPRO 1710 LITE i3 GEN 12 8/ 256 FULLSET', brand='Advan', model='Workpro 1710 Lite', processor='Intel Core i3 Gen 12', ram_gb=8, storage='256 GB', touchscreen=false, needs_verification=false, source_ref='22' where sku='LTP-0014';
update inventory_units set source_raw='ADVAN WORKPRO 1710 LITE i3 GEN 12 8/ 256 FULLSET', notes='Tertulis ''i3 GEN 12 8/ 256 FULLSET'' (FULLSET = kelengkapan penuh); tipe storage tidak disebut.' where internal_asset_code='UNIT-CDL-000021';
update products set name='Dell Latitude E5720 Intel Core i5 Gen 6 8GB/256', original_name='DELL LATITUDE E5720 i5 GEN 6 8/256', brand='Dell', model='Latitude E5720', processor='Intel Core i5 Gen 6', ram_gb=8, storage='256 GB', touchscreen=false, needs_verification=true, source_ref='23' where sku='LTP-0015';
update inventory_units set source_raw='DELL LATITUDE E5720 i5 GEN 6 8/256', notes='Model tertulis ''E5720'' persis seperti daftar; mohon cek fisik (kemungkinan salah ketik). [PERLU VERIFIKASI]' where internal_asset_code='UNIT-CDL-000022';
update products set name='PC All In One Happy GSR Intel Core i7-3520M 8GB/256', original_name='PC ALL IN ONE HAPPY GSR i7-3520M 8/256', brand=NULL, model='All In One Happy GSR', processor='Intel Core i7-3520M', ram_gb=8, storage='256 GB', touchscreen=false, needs_verification=false, source_ref='24' where sku='AIO-0001';
update inventory_units set source_raw='PC ALL IN ONE HAPPY GSR i7-3520M 8/256', notes='Bukan laptop (PC All-in-One).' where internal_asset_code='UNIT-CDL-000023';
update products set name='Acer Aspire AS1-432 Intel Celeron N3350 6GB/256', original_name='ACER ASPIRE AS1-432 CELERON N3350 6/256', brand='Acer', model='Aspire AS1-432', processor='Intel Celeron N3350', ram_gb=6, storage='256 GB', touchscreen=false, needs_verification=false, source_ref='25' where sku='LTP-0016';
update inventory_units set source_raw='ACER ASPIRE AS1-432 CELERON N3350 6/256', notes='RAM tertulis 6 GB (''6/256''); cek fisik bila perlu.' where internal_asset_code='UNIT-CDL-000024';
update products set name='Toshiba Dynabook K50 Intel Celeron N4020 4GB/64', original_name='TOSHIBA DYNABOOK K50 N4020 4/64', brand='Toshiba', model='Dynabook K50', processor='Intel Celeron N4020', ram_gb=4, storage='64 GB', touchscreen=false, needs_verification=false, source_ref='26,27,28,29,30,31,32,33,34,35' where sku='LTP-0017';
update inventory_units set source_raw='TOSHIBA DYNABOOK K50 N4020 4/64', notes=NULL where internal_asset_code='UNIT-CDL-000025';
update inventory_units set source_raw='TOSHIBA DYNABOOK K50 N4020 4/64', notes=NULL where internal_asset_code='UNIT-CDL-000026';
update inventory_units set source_raw='TOSHIBA DYNABOOK K50 N4020 4/64', notes=NULL where internal_asset_code='UNIT-CDL-000027';
update inventory_units set source_raw='TOSHIBA DYNABOOK K50 N4020 4/64', notes=NULL where internal_asset_code='UNIT-CDL-000028';
update inventory_units set source_raw='TOSHIBA DYNABOOK K50 N4020 4/64', notes=NULL where internal_asset_code='UNIT-CDL-000029';
update inventory_units set source_raw='TOSHIBA DYNABOOK K50 N4020 4/64', notes=NULL where internal_asset_code='UNIT-CDL-000030';
update inventory_units set source_raw='TOSHIBA DYNABOOK K50 N4020 4/64', notes=NULL where internal_asset_code='UNIT-CDL-000031';
update inventory_units set source_raw='TOSHIBA DYNABOOK K50 N4020 4/64', notes=NULL where internal_asset_code='UNIT-CDL-000032';
update inventory_units set source_raw='TOSHIBA DYNABOOK K50 N4020 4/64', notes=NULL where internal_asset_code='UNIT-CDL-000033';
update inventory_units set source_raw='TOSHIBA DYNABOOK K50 N4020 4/64', notes=NULL where internal_asset_code='UNIT-CDL-000034';
update products set name='Infinix XBook AMD Ryzen 5 5500 8GB/256', original_name='INFINIX XBOOK i5 RAYZEN 5 5500 8/256', brand='Infinix', model='XBook', processor='AMD Ryzen 5 5500', ram_gb=8, storage='256 GB', touchscreen=false, needs_verification=true, source_ref='39' where sku='LTP-0018';
update inventory_units set source_raw='INFINIX XBOOK i5 RAYZEN 5 5500 8/256', notes='Tertulis ''i5 RAYZEN 5 5500''; mohon cek prosesor sebenarnya pada perangkat. [PERLU VERIFIKASI]' where internal_asset_code='UNIT-CDL-000038';
update products set name='Axioo Hype 1 Intel Celeron N4020 4GB/128', original_name='AXIOO HYPE 1 INTEL CELERON N4020 4/128', brand='Axioo', model='Hype 1', processor='Intel Celeron N4020', ram_gb=4, storage='128 GB', touchscreen=false, needs_verification=false, source_ref='40,41' where sku='LTP-0019';
update inventory_units set source_raw='AXIOO HYPE 1 INTEL CELERON N4020 4/128', notes=NULL where internal_asset_code='UNIT-CDL-000039';
update inventory_units set source_raw='AXIOO HYPE 1 INTEL CELERON N4020 4/128', notes=NULL where internal_asset_code='UNIT-CDL-000040';
update products set name='Lenovo D330 Intel Celeron (seri tidak disebut) 4GB/64 (SD/eMMC - belum jelas)', original_name='LENOVO D330 INTEL CELERON 4/SD 64GB', brand='Lenovo', model='D330', processor='Intel Celeron (seri tidak disebut)', ram_gb=4, storage='64 GB (SD/eMMC - belum jelas)', touchscreen=false, needs_verification=true, source_ref='42,43,44,45,46' where sku='LTP-0020';
update inventory_units set source_raw='LENOVO D330 INTEL CELERON 4/SD 64GB', notes='''SD 64GB'' kemungkinan eMMC/SD; jangan diisi SSD tanpa verifikasi [PERLU VERIFIKASI]' where internal_asset_code='UNIT-CDL-000041';
update inventory_units set source_raw='LENOVO D330 INTEL CELERON 4/SD 64GB', notes='''SD 64GB'' kemungkinan eMMC/SD; jangan diisi SSD tanpa verifikasi [PERLU VERIFIKASI]' where internal_asset_code='UNIT-CDL-000042';
update inventory_units set source_raw='LENOVO D330 INTEL CELERON 4/SD 64GB', notes='''SD 64GB'' kemungkinan eMMC/SD; jangan diisi SSD tanpa verifikasi [PERLU VERIFIKASI]' where internal_asset_code='UNIT-CDL-000043';
update inventory_units set source_raw='LENOVO D330 INTEL CELERON 4/SD 64GB', notes='''SD 64GB'' kemungkinan eMMC/SD; jangan diisi SSD tanpa verifikasi [PERLU VERIFIKASI]' where internal_asset_code='UNIT-CDL-000044';
update inventory_units set source_raw='LENOVO D330 INTEL CELERON 4/SD 64GB', notes='''SD 64GB'' kemungkinan eMMC/SD; jangan diisi SSD tanpa verifikasi [PERLU VERIFIKASI]' where internal_asset_code='UNIT-CDL-000045';
update products set name='Lenovo ThinkPad X270 Intel Core i5-6300U 8GB/256', original_name='LENOVO THINKPAD X270 INTELCORE i5-6300U 8/256GB', brand='Lenovo', model='ThinkPad X270', processor='Intel Core i5-6300U', ram_gb=8, storage='256 GB', touchscreen=false, needs_verification=false, source_ref='47,48' where sku='LTP-0021';
update inventory_units set source_raw='LENOVO THINKPAD X270 INTELCORE i5-6300U 8/256GB', notes=NULL where internal_asset_code='UNIT-CDL-000046';
update inventory_units set source_raw='LENOVO THINKPAD X270 INTELCORE i5-6300U 8/256GB', notes=NULL where internal_asset_code='UNIT-CDL-000047';
update products set name='Dell Latitude 7410 Intel Core i5-10310U 16GB/256', original_name='DELL LATITUDE 7410 INTEL CORE i5-10310U 16/256GB', brand='Dell', model='Latitude 7410', processor='Intel Core i5-10310U', ram_gb=16, storage='256 GB', touchscreen=false, needs_verification=false, source_ref='49' where sku='LTP-0022';
update inventory_units set source_raw='DELL LATITUDE 7410 INTEL CORE i5-10310U 16/256GB', notes=NULL where internal_asset_code='UNIT-CDL-000048';
update products set name='CABLE HDMI', original_name='CABLE HDMI', brand=NULL, model=NULL, processor=NULL, ram_gb=NULL, storage=NULL, touchscreen=NULL, needs_verification=false, source_ref='51,52,61,62,63,64,65' where sku='ACC-0001';
update products set name='CABLE PORT ADAPTER HDMI TO VGA', original_name='CABLE PORT ADAPTER HDMI TO VGA', brand=NULL, model=NULL, processor=NULL, ram_gb=NULL, storage=NULL, touchscreen=NULL, needs_verification=false, source_ref='53,54,55,56' where sku='ACC-0002';
update products set name='USB WIFI WIRELESS 300 MBPS', original_name='USB WIFI WIRELESS 300 MBPS', brand=NULL, model=NULL, processor=NULL, ram_gb=NULL, storage=NULL, touchscreen=NULL, needs_verification=false, source_ref='58,59,60' where sku='ACC-0003';
update products set name='OBENG 4 PCS/SET', original_name='OBENG 4 PCS/SET', brand=NULL, model=NULL, processor=NULL, ram_gb=NULL, storage=NULL, touchscreen=NULL, needs_verification=false, source_ref='66,67,68,69,70' where sku='ACC-0004';
update products set name='MOUSE CABLE MTECH MT-129', original_name='MOUSE CABLE MTECH MT-129', brand='MTECH', model='MT-129', processor=NULL, ram_gb=NULL, storage=NULL, touchscreen=NULL, needs_verification=false, source_ref='71,72,73,74,75,76,77,78,79' where sku='ACC-0005';
update products set name='MOUSE LOGITECH B175 WIRELESS', original_name='MOUSE LOGITECH B175 WIRELESS', brand='Logitech', model='B175', processor=NULL, ram_gb=NULL, storage=NULL, touchscreen=NULL, needs_verification=false, source_ref='80,81,82,83,84,85,86,87,88' where sku='ACC-0006';
update products set name='MOUSEPAD HITAM POLOS', original_name='MOUSEPAD HITAM POLOS', brand=NULL, model=NULL, processor=NULL, ram_gb=NULL, storage=NULL, touchscreen=NULL, needs_verification=false, source_ref='89,90,91,92,93,94,95,96,97' where sku='ACC-0007';
-- 4. Harga estimasi barang bekas (hanya mengisi yang kosong / masih berstatus estimasi).
with est(sku, price) as (values ('LTP-0001', 5000000), ('LTP-0002', 4700000), ('LTP-0003', 4200000), ('LTP-0023', 4400000), ('LTP-0004', 4500000), ('LTP-0005', 6500000), ('LTP-0007', 3400000), ('LTP-0008', 1400000), ('LTP-0009', 1700000), ('LTP-0010', 1400000), ('LTP-0011', 2200000), ('LTP-0012', 2400000), ('LTP-0013', 1900000), ('LTP-0014', 4200000), ('LTP-0015', 3000000), ('AIO-0001', 2200000), ('LTP-0016', 1800000), ('LTP-0017', 1800000), ('LTP-0018', 4200000), ('LTP-0019', 2000000), ('LTP-0020', 1500000), ('LTP-0021', 3200000), ('LTP-0022', 5500000), ('ACC-0001', 30000), ('ACC-0002', 50000), ('ACC-0003', 60000), ('ACC-0004', 20000), ('ACC-0005', 30000), ('ACC-0006', 150000), ('ACC-0007', 15000))
update products p set default_price = est.price,
       specs = coalesce(p.specs, '{}'::jsonb) || '{"catatan_harga": "estimasi, belum diverifikasi"}'::jsonb
  from est where p.sku = est.sku
   and (p.default_price is null or p.default_price = 0 or p.specs ->> 'catatan_harga' = 'estimasi, belum diverifikasi');
commit;
-- Cek: select sku, name, default_price from products where not archived order by sku;
