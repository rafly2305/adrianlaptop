# Petunjuk Database — Adrian Laptop Store (Supabase)

Database aplikasi ini adalah **PostgreSQL di Supabase**. Folder ini berisi 4 file SQL yang dijalankan **berurutan** di project Supabase yang masih kosong.

| Urutan | File | Isi |
|---|---|---|
| 1 | `LANGKAH-1_skema.sql` | Tabel, keamanan akses (RLS), fungsi transaksi, audit log |
| 2 | `LANGKAH-2_enum.sql` | Nilai status transfer (**harus dijalankan sendiri**) |
| 3 | `LANGKAH-3_fitur-pos.sql` | Inventaris lengkap, POS (diskon/pajak %, 4 metode bayar, anti transaksi ganda), bucket foto produk |
| 4 | `LANGKAH-4_data-cidodol.sql` | Lokasi Cidodol, 30 produk, 49 unit laptop/PC, 46 pcs aksesori, harga estimasi |

## A. Membuat database baru
1. Buka https://supabase.com → **New project**. Region **Singapore**. Simpan *database password*.
2. **Authentication → Providers → Email**: matikan **Allow new users to sign up** (akun hanya dibuat admin).
3. **SQL Editor → New query**. Untuk setiap file urutan 1 → 4: buka file, **salin seluruh isinya**, tempel, klik **Run**, tunggu **Success**, baru lanjut.
   - Jangan digabung. Langkah 2 wajib Run sendiri.
   - Pada langkah 3 Supabase mungkin memperingatkan ada perintah `delete`/`drop` (itu pembersihan data demo yang tidak ada di database baru). Pilih **Run this query**.
4. Cek hasil (New query, Run):
```sql
select count(*) as produk from products;                              -- 30
select count(*) as unit_berseri from inventory_units;                 -- 49
select coalesce(sum(qty),0) as aksesori_pcs from inventory_balances;  -- 46
select code, name from branches;                                      -- hanya CDL / Cidodol
select sku, name from products where default_price is null or default_price = 0;  -- 0 baris
```
5. **Storage**: pastikan ada bucket `product-images` (Public). Jika tidak ada: New bucket → nama `product-images` → centang Public.

## B. Menghubungkan ke website
1. Supabase → **Project Settings → API**: catat **Project URL**, **anon/publishable key**, dan **service_role key** (rahasia).
2. Vercel → project website → **Settings → Environment Variables** (Production dan Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (**jangan** pakai awalan `NEXT_PUBLIC_`)
3. **Deployments → Redeploy** (wajib setiap variabel diubah). Buka `https://<domain-anda>/api/health` → harus `status: ok`.

## C. Membuat Super Admin pertama (tanpa perlu Node.js)
1. Supabase → **Authentication → Users → Add user → Create new user**: isi email & password (min. 12 karakter), centang **Auto Confirm User**.
2. SQL Editor, ganti email lalu Run:
```sql
insert into profiles(id, full_name, role, default_branch_id)
select u.id, 'Nama Anda', 'super_admin', (select id from branches where code = 'CDL')
from auth.users u where u.email = 'email-anda@contoh.com';
```
3. Buka website → login dengan email & password tadi.
(Alternatif: `scripts/bootstrap-admin.mjs`, lihat `docs/DEPLOY.md`.)

## D. Pengaturan awal setelah login (Super Admin)
1. **Pengaturan → Rekening tujuan Transfer Bank**: isi rekening asli toko. Tanpa ini Transfer Bank tidak bisa dikonfirmasi di POS.
2. **Pengaturan → Pembayaran QRIS**: unggah gambar QRIS statis resmi toko (tanpa ini POS menampilkan placeholder simulasi).
3. **Pengaturan → Profil toko & penjualan**: alamat, telepon, teks struk, tarif pajak (%), batas diskon Kasir (%).
4. **User Management**: buat akun Admin / Kasir. Semua akun otomatis punya akses ke lokasi Cidodol.
5. **Produk**: harga di database adalah **estimasi barang bekas**; sesuaikan bila perlu.

## E. Database lama (sudah pernah diisi versi sebelumnya)
Jangan jalankan 4 file di atas. Jalankan hanya yang belum pernah:
- `supabase/migrations/0006_transfer_pending.sql` (sendiri) → `0007_inventory_pos.sql` bila belum;
- lalu **wajib** `0008_single_location_pos.sql` → `0009_koreksi_inventaris_dan_harga.sql`.
**Backup dulu** (Supabase → Database → Backups, atau `supabase db dump`). 0008 menghapus data demo (bukan data Cidodol).

## F. Masalah umum
| Gejala | Penyebab / solusi |
|---|---|
| `unsafe use of new enum value` saat langkah 3 | Langkah 2 belum dijalankan/sukses atau digabung. Jalankan `LANGKAH-2_enum.sql` sendiri, lalu ulangi langkah 3. |
| `type ... already exists` | File 1 sudah pernah dijalankan. Pakai project kosong, atau lanjut dari langkah berikutnya. |
| Login berhasil tapi halaman kosong / "akses ditolak" | Profil belum dibuat (langkah C.2) atau email di SQL tidak sama dengan akun. |
| `/api/health` bukan `ok` | Variabel environment salah/belum redeploy. |
| POS: "Rekening tujuan belum diatur" | Isi di Pengaturan (D.1). |
| Foto produk gagal diunggah | Bucket `product-images` belum ada / belum Public (A.5). |

> Catatan jujur: SQL ini sudah diperiksa strukturnya (kurung, `$$`, begin/commit) tetapi **belum dijalankan** pada PostgreSQL oleh penyusun. Jalankan pertama kali di project Supabase **uji** (gratis) sebelum project produksi, lalu cek kueri pada A.4.
