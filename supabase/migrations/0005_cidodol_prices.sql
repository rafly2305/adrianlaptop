-- 0005_cidodol_prices.sql — Melengkapi harga jual produk Cidodol yang masih kosong (NULL/0).
-- ESTIMASI berdasarkan merek/seri/prosesor/RAM/penyimpanan (pasar laptop bekas/second). Bukan harga terverifikasi;
-- ubah kapan saja lewat halaman Produk. Idempoten: hanya mengisi yang kosong, TIDAK menimpa harga yang sudah ada.
begin;
with est(sku, price) as (values
  ('LTP-0001', 4900000), ('LTP-0002', 4800000), ('LTP-0003', 4200000), ('LTP-0004', 4500000), ('LTP-0005', 6500000),
  ('LTP-0006', 2900000), ('LTP-0007', 3300000), ('LTP-0008', 1500000), ('LTP-0009', 1900000), ('LTP-0010', 1400000),
  ('LTP-0011', 2100000), ('LTP-0012', 2500000), ('LTP-0013', 2000000), ('LTP-0014', 2800000), ('LTP-0015', 3000000),
  ('LTP-0016', 1900000), ('LTP-0017', 1800000), ('LTP-0018', 5200000), ('LTP-0019', 2300000), ('LTP-0020', 1600000),
  ('LTP-0021', 3100000), ('LTP-0022', 5600000),
  ('AIO-0001', 2600000),
  ('ACC-0001', 25000), ('ACC-0002', 45000), ('ACC-0003', 65000), ('ACC-0004', 25000),
  ('ACC-0005', 35000), ('ACC-0006', 150000), ('ACC-0007', 15000)
)
update products p
   set default_price = est.price,
       specs = coalesce(p.specs, '{}'::jsonb) || '{"catatan_harga": "estimasi, belum diverifikasi"}'::jsonb
  from est
 where p.sku = est.sku and (p.default_price is null or p.default_price = 0);
commit;

-- Cek hasil: produk Cidodol yang masih tanpa harga (seharusnya 0 baris)
-- select sku, name from products where data_origin = 'real' and not archived and (default_price is null or default_price = 0);
