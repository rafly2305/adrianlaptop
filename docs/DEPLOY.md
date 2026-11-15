# Panduan Deploy (Supabase Free + Vercel, domain tetap adrianlaptop.vercel.app)

Tidak ada nilai rahasia yang perlu dikirim ke siapa pun. Semua nilai diisi sendiri di dashboard masing-masing.

## 0. Sebelum menyentuh produksi
1. **Ganti/nonaktifkan** akun lama `boss/admin/staff/warranty` (password di README PHP lama) pada deployment yang masih hidup.
2. Aplikasi PHP lama **tetap dibiarkan hidup** sampai versi baru lolos uji. Jangan hapus deployment atau project Vercel.
3. Dugaan penyebab Inventory sering error pada versi lama (belum terbukti): koneksi MySQL baru tiap request tanpa retry + `die()`, dan penyedia MySQL berbasis IP-allowlist yang tidak cocok dengan Vercel. Cek **Vercel → Project → Logs** untuk bukti sebelum yakin.

## 1. Supabase (Free)
1. supabase.com → New project. Pilih region **Singapore** (dekat Vercel `sin1`). Simpan database password di password manager.
2. **Authentication → Providers → Email**: matikan *Allow new users to sign up*. (Akun hanya dibuat admin.) **URL Configuration**: Site URL `https://adrianlaptop.vercel.app`.
3. **SQL Editor**: ikuti `database/PETUNJUK.md` (4 file `database/LANGKAH-1…4`, dijalankan berurutan, satu per Run). Database lama: jalankan 0008 → 0009 saja.
4. Data awal Cidodol + harga estimasi sudah termasuk di `LANGKAH-4_data-cidodol.sql`. Tidak ada seed demo.
5. **Project Settings → API**: catat *Project URL*, *anon/publishable key*, dan *service_role key* (rahasia).

## 2. Super Admin pertama (lokal, bukan di Vercel)
```bash
cp .env.example .env.local        # isi 3 nilai dari langkah 1.5
npm install
BOOTSTRAP_EMAIL=anda@contoh.com BOOTSTRAP_PASSWORD='<min 12 karakter acak>' BOOTSTRAP_NAME='Nama Anda' \
  node --env-file=.env.local scripts/bootstrap-admin.mjs
```
Akun lain (Admin, Kasir, dll.) dibuat dari **User Management**; semua akun otomatis memiliki akses ke lokasi Cidodol. Setelah login pertama, isi **Pengaturan → QRIS & Rekening** agar metode QRIS/Transfer Bank siap dipakai.

## 3. Uji lokal sebelum deploy
```bash
npm run typecheck && npm run lint && npm run build && npm run dev
```
Jalankan juga `supabase/tests/pos_test.sql` di **project staging** (lihat TESTING.md).

## 4. Vercel — memakai project & domain yang sama
1. Taruh kode baru di **branch baru** repo yang terhubung ke project Vercel yang ada (pastikan `Dockerfile.vercel`/`vercel.json` lama **tidak** ikut di branch itu).
2. Vercel → Project → Settings → **Environment Variables** (Production **dan** Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (**jangan** diberi awalan `NEXT_PUBLIC_`)
   Ubah variabel `NEXT_PUBLIC_*` ⇒ wajib redeploy.
3. Settings → General → **Framework Preset: Next.js** (hapus override Docker/Build lama bila ada). Push branch ⇒ **Preview deployment** (URL terpisah). Uji end-to-end di sana.
4. Cek `https://<preview>/api/health` ⇒ `status: ok`.
5. Setelah lolos uji: merge ke branch produksi ⇒ domain `adrianlaptop.vercel.app` otomatis menyajikan versi baru.
6. **Rollback:** Vercel → Deployments → pilih deployment PHP sebelumnya → *Promote to Production* / Instant Rollback. Database baru terpisah dari MySQL lama sehingga rollback tidak merusak data.

## 5. Backup & pemulihan
- Rutin (mis. mingguan, dan sebelum migrasi): `npx supabase db dump --db-url "<connection string>" -f backup-$(date +%F).sql` (data: tambahkan `--data-only`). Simpan di luar Supabase. Connection string: Project Settings → Database (rahasia).
- Pemulihan: buat project Supabase baru → jalankan migration → impor dump data (`psql`). Latihan pemulihan sekali sebelum go-live.
- Periksa di dashboard Anda apakah paket Free menyediakan backup otomatis; **jangan mengandalkannya** tanpa memverifikasi.

## 6. Pemantauan batas layanan gratis
- Supabase Dashboard → **Usage**: ukuran database (batas Free ±500 MB — verifikasi angka terbaru), bandwidth, MAU. Inventory 49 unit + transaksi harian masih sangat kecil.
- Project Free dapat **dijeda otomatis jika tidak aktif** (verifikasi kebijakan terbaru). Aktifkan monitor uptime gratis (mis. UptimeRobot) ke `/api/health`; **catatan:** endpoint ini mengecek ketersediaan Supabase Auth, belum tentu dihitung sebagai aktivitas database — jangan diandalkan untuk mencegah jeda; buka aplikasi secara berkala/aktif dipakai.
- Supabase Free tidak menjamin uptime; aplikasi menampilkan error yang jelas (bukan data kosong) saat gangguan.
