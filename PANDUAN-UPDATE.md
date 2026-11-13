# Panduan update (Tahap 1–3)

## 1. Database (Supabase → SQL Editor) — jalankan BERURUTAN, satu file per eksekusi
1. `supabase/migrations/0005_cidodol_prices.sql`  (estimasi harga Cidodol; tidak menimpa harga yang sudah ada)
2. `supabase/migrations/0006_transfer_pending.sql` (status transfer "Menunggu")  ← jalankan sendiri, tunggu sukses
3. `supabase/migrations/0007_inventory_pos.sql`    (barang keluar, stok opname, transfer bertahap, pembayaran POS, kolom foto, riwayat stok before/after)

Bucket foto: 0007 mencoba membuat bucket publik `product-images`. Jika muncul NOTICE gagal, buat manual di
Supabase → Storage → New bucket → nama `product-images` → centang Public.

## 2. Kode
Salin seluruh isi zip ke folder repo (Replace), lalu:
    git add .
    git commit -m "Tahap 2-3: inventory lengkap, POS baru, dokumen cetak"
    git push

## 3. Pengaturan awal (setelah login sebagai Super Admin)
- Pengaturan → isi alamat toko, telepon, teks kaki struk, pajak (%) bila dipakai, dan metode pembayaran
  (harus memuat "Tunai"; sisanya otomatis jadi pilihan Non-Tunai di POS).
- Inventory → Stok Menipis → "Atur batas minimal stok per produk".
- Produk → edit produk → unggah foto agar tampil di kartu POS.

## 4. Uji cepat
POS: tambah produk → Bayar Tunai (cek kembalian) → buka detail transaksi → Cetak Thermal / Faktur / Surat Jalan.
Inventory: Barang Masuk → Barang Keluar → Stok Opname → Transfer (Menunggu → Kirim → Terima) → Riwayat Pergerakan.
