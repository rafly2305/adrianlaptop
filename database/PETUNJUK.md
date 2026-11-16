# Petunjuk Database — Adrian Laptop Store (Supabase, instalasi BARU)

Database aplikasi ini adalah **PostgreSQL di Supabase**. Folder ini berisi 4 file SQL yang dijalankan **berurutan** di project Supabase yang **masih kosong**.

| Urutan | File | Isi |
|---|---|---|
| 1 | `LANGKAH-1_skema.sql` | Tabel, keamanan akses (RLS), fungsi transaksi, audit log |
| 2 | `LANGKAH-2_enum.sql` | Nilai status transfer (**harus dijalankan sendiri**) |
| 3 | `LANGKAH-3_fitur-pos.sql` | Inventaris lengkap, POS (diskon/pajak %, 4 metode bayar, anti transaksi ganda), bucket foto produk |
| 4 | `LANGKAH-4_data-cidodol.sql` | Lokasi Cidodol, 30 produk, 49 unit laptop/PC, 46 pcs aksesori, harga estimasi |

Folder lain: `tests/pos_test.sql` (tes opsional) dan `sumber-data/` (arsip daftar inventaris asal data Cidodol, tidak perlu dijalankan).

## A. Membuat database
1. Buka https://supabase.com → **New project**. Region **Singapore**. Simpan *database password*.
2. **Authentication → Providers → Email**: matikan **Allow new users to sign up** (akun hanya dibuat admin).
3. **SQL Editor → New query**. Untuk setiap file urutan 1 → 4: buka file, **salin seluruh isinya**, tempel, klik **Run**, tunggu **Success**, baru lanjut.
   - Jangan digabung. Langkah 2 wajib Run sendiri.
   - Supabase mungkin menampilkan peringatan "destructive operation" (karena ada kata `drop`/`delete` di dalam fungsi). Pilih **Run this query**; di project kosong tidak ada data yang terhapus.
4. Cek hasil (New query, Run):
```sql
select count(*) as produk from products;                              -- 30
select count(*) as unit_berseri from inventory_units;                 -- 49
select coalesce(sum(qty),0) as aksesori_pcs from inventory_balances;  -- 46
select code, name from branches;                                      -- hanya CDL / Cidodol
select sku, name from products where default_price is null or default_price = 0;  -- 0 baris
```
5. **Storage**: pastikan ada bucket `product-images` (Public). Jika tidak ada: New bucket → nama `product-images` → centang Public.

## B. Menghubungkan ke website (Vercel)
1. Supabase → **Project Settings → API**: catat **Project URL**, **anon/publishable key**, dan **service_role key** (rahasia).
2. Vercel → project → **Settings → Environment Variables** (Production dan Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (**jangan** pakai awalan `NEXT_PUBLIC_`)
3. **Deployments → Redeploy** (wajib setiap variabel diubah). Buka `https://<domain-anda>/api/health` → harus `status: ok`.

## C. Membuat Super Admin pertama
1. Supabase → **Authentication → Users → Add user → Create new user**: isi email & password (min. 12 karakter), centang **Auto Confirm User**.
2. SQL Editor, ganti email dan nama, lalu Run:
```sql
insert into profiles(id, full_name, role, default_branch_id)
select u.id, 'Nama Anda', 'super_admin', (select id from branches where code = 'CDL')
from auth.users u where u.email = 'email-anda@contoh.com';
```
3. Buka website → login dengan email & password tadi.

## D. Pengaturan awal setelah login (Super Admin)
1. **Pengaturan → Rekening tujuan Transfer Bank**: isi rekening asli toko. Tanpa ini Transfer Bank tidak bisa dikonfirmasi di POS.
2. **Pengaturan → Pembayaran QRIS**: unggah gambar QRIS statis resmi toko.
3. **Pengaturan → Profil toko & penjualan**: alamat, telepon, teks struk, tarif pajak (%), batas diskon Kasir (%).
4. **User Management**: buat akun Admin / Kasir. Semua akun otomatis punya akses ke lokasi Cidodol.
5. **Produk**: harga di database adalah **estimasi barang bekas**; sesuaikan bila perlu.

## E. Masalah umum
| Gejala | Penyebab / solusi |
|---|---|
| `unsafe use of new enum value` saat langkah 3 | Langkah 2 belum dijalankan/sukses atau digabung. Jalankan `LANGKAH-2_enum.sql` sendiri, lalu ulangi langkah 3. |
| `type ... already exists` | File 1 sudah pernah dijalankan di project ini. Hapus project dan buat ulang yang kosong (atau reset database), lalu ulangi dari langkah 1. |
| Login berhasil tapi halaman kosong / "akses ditolak" | Profil belum dibuat (C.2) atau email di SQL tidak sama dengan akun. |
| `/api/health` bukan `ok` | Variabel environment salah/belum redeploy. |
| POS: "Rekening tujuan belum diatur" | Isi di Pengaturan (D.1). |
| Foto produk gagal diunggah | Bucket `product-images` belum ada / belum Public (A.5). |

> Catatan jujur: SQL ini sudah diperiksa strukturnya (kurung, `$$`, begin/commit) tetapi **belum dijalankan** pada PostgreSQL oleh penyusun. Jalankan pertama kali di project Supabase **uji** (gratis) dan cek kueri pada A.4 sebelum memakai project produksi.
