# Panduan Deploy — instalasi baru (Supabase Free + Vercel)

Tidak ada nilai rahasia yang perlu dikirim ke siapa pun. Semua nilai diisi sendiri di dashboard masing-masing.

## 1. Supabase
Ikuti **`database/PETUNJUK.md`** bagian A (4 file SQL berurutan), lalu catat 3 nilai dari **Project Settings → API**:
Project URL, anon/publishable key, dan service_role key (rahasia).
Di **Authentication → URL Configuration**, isi *Site URL* dengan alamat Vercel Anda setelah deploy pertama.

## 2. GitHub
Buat repository (disarankan Private), lalu push seluruh isi folder project. File `.env*` sudah dikecualikan oleh `.gitignore`; jangan pernah meng-commit key.

## 3. Vercel
1. vercel.com → **Add New → Project** → import repository. Framework terdeteksi **Next.js**; biarkan perintah build default.
2. Isi **Environment Variables** (Production **dan** Preview) sebelum Deploy:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (**jangan** diberi awalan `NEXT_PUBLIC_`)
   Mengubah variabel ⇒ wajib **Redeploy**.
3. Klik **Deploy**, lalu buka `https://<domain-anda>/api/health` ⇒ harus `status: ok`.

## 4. Super Admin pertama & pengaturan awal
Ikuti `database/PETUNJUK.md` bagian C dan D (buat user di Supabase Auth → insert profil → login → isi rekening, QRIS, pajak).

(Alternatif lokal tanpa SQL: `cp .env.example .env.local`, isi 3 nilai, `npm install`, lalu
`BOOTSTRAP_EMAIL=... BOOTSTRAP_PASSWORD='<min 12 karakter>' BOOTSTRAP_NAME='Nama' node --env-file=.env.local scripts/bootstrap-admin.mjs`.)

## 5. Uji lokal (opsional, sebelum deploy)
```bash
npm install
npm run typecheck && npm run lint && npm run build && npm run dev
```

## 6. Backup
- Rutin (mis. mingguan): `npx supabase db dump --db-url "<connection string>" -f backup-$(date +%F).sql` (tambahkan `--data-only` untuk data saja). Simpan di luar Supabase. Connection string: Project Settings → Database (rahasia).
- Periksa di dashboard apakah paket Free menyediakan backup otomatis; jangan mengandalkannya tanpa memverifikasi.

## 7. Batas layanan gratis
- Supabase → **Usage**: ukuran database, bandwidth, pengguna aktif. Project Free dapat **dijeda otomatis jika lama tidak aktif** (verifikasi kebijakan terbaru); buka/pakai aplikasi secara berkala.
- Supabase Free tidak menjamin uptime; aplikasi menampilkan error yang jelas (bukan data kosong) saat gangguan.
