-- 02_harga_estimasi.sql (dibuat oleh scripts/gen_seed.py) — harga jual ESTIMASI barang bekas; idempoten.
-- Hanya mengisi harga yang kosong atau yang masih berstatus 'estimasi'; harga yang sudah diisi manual TIDAK ditimpa.
begin;
with est(sku, price) as (values ('LTP-0001', 5000000), ('LTP-0002', 4700000), ('LTP-0003', 4200000), ('LTP-0023', 4400000), ('LTP-0004', 4500000), ('LTP-0005', 6500000), ('LTP-0007', 3400000), ('LTP-0008', 1400000), ('LTP-0009', 1700000), ('LTP-0010', 1400000), ('LTP-0011', 2200000), ('LTP-0012', 2400000), ('LTP-0013', 1900000), ('LTP-0014', 4200000), ('LTP-0015', 3000000), ('AIO-0001', 2200000), ('LTP-0016', 1800000), ('LTP-0017', 1800000), ('LTP-0018', 4200000), ('LTP-0019', 2000000), ('LTP-0020', 1500000), ('LTP-0021', 3200000), ('LTP-0022', 5500000), ('ACC-0001', 30000), ('ACC-0002', 50000), ('ACC-0003', 60000), ('ACC-0004', 20000), ('ACC-0005', 30000), ('ACC-0006', 150000), ('ACC-0007', 15000))
update products p set default_price = est.price,
       specs = coalesce(p.specs, '{}'::jsonb) || '{"catatan_harga": "estimasi, belum diverifikasi"}'::jsonb
  from est where p.sku = est.sku
   and (p.default_price is null or p.default_price = 0 or p.specs ->> 'catatan_harga' = 'estimasi, belum diverifikasi');
commit;
