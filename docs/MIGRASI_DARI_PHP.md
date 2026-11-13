# Pemetaan fitur PHP lama → aplikasi baru

| Fitur lama (PHP v6) | Aplikasi baru | Catatan |
|---|---|---|
| Dashboard Owner (grafik 30 hari/bulanan/tahunan, model terlaris) | `/` Dashboard + `/reports` | Angka dihitung dari database; filter periode & cabang. Per-bulan/tahun: ubah rentang tanggal |
| Inventory laptop (CRUD) | `/inventory` (Unit, Produk, Stok menipis, Riwayat, Transfer) | Hapus permanen diganti **arsip** |
| Inventory aksesori | produk `tracking = quantity` | Saldo per cabang, penyesuaian beralasan |
| Quality Control unit masuk | `unit_inspections` (detail unit → Pemeriksaan) | Checklist + catatan |
| POS / transaksi | `/pos`, `/sales`, `/sales/[id]` | Transaksional di DB; retur/void beralasan; struk cetak/PDF |
| Customer | `customers` (dibuat saat transaksi/tiket) | Dipisah per cabang |
| Warranty otomatis 1 bulan | `/warranty` + pengaturan “masa garansi toko” | **Tidak lagi otomatis 1 bulan**: aturan ini belum terverifikasi; diisi pemilik di Pengaturan atau per unit |
| Klaim warranty + riwayat status | `/service` (tiket, riwayat, status 6 tahap) | |
| Notifikasi | lonceng header | Tiket terbuka & stok menipis |
| Activity log | `audit_logs` (Pengaturan, Dashboard) | Termasuk perubahan stok/transaksi/pengaturan |
| Global search | kolom pencarian header → `/search` | Serial, kode unit, SKU, invoice, tiket |
| Manajemen user | `/settings` | Supabase Auth + role + akses cabang |
| `branch_sales` (angka karangan 6 cabang) | **tidak dimigrasi** | Diganti data demo sintetis 1 bulan (`data_origin='demo'`) |
| Seed lama (50 laptop, 18 “terjual”) | **tidak dimigrasi** | Tidak sesuai daftar Anda; diganti seed dari daftar (49 unit + 46 pcs) |
| Password hash PHP | **tidak dimigrasi** | Buat akun baru lewat Supabase Auth |
