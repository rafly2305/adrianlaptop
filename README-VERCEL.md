# Adrian Laptop KP V6 — Vercel Ready

V6 mempertahankan fitur/tampilan V5 dan menambahkan konfigurasi deployment Vercel menggunakan container PHP.

## Yang berubah dari V5
- `Dockerfile.vercel` untuk menjalankan PHP 8.2 + Apache di Vercel.
- `docker-entrypoint-vercel.sh` agar Apache mengikuti environment variable `PORT` dari Vercel.
- `config/database.php` mendukung database lokal maupun MySQL online melalui Environment Variables.
- `.gitignore` dan `.dockerignore` agar secret/file lokal tidak ikut ter-upload.
- `.env.example` sebagai contoh konfigurasi.
- `health.php` untuk mengecek apakah aplikasi dan database online sudah terhubung.

## Tetap bisa digunakan di XAMPP
Tidak perlu mengisi environment variable untuk penggunaan lokal default.

1. Letakkan folder di `htdocs/adrian-laptop-kp`.
2. Nyalakan Apache dan MySQL.
3. Import `database/adrian_laptop_kp.sql` ke phpMyAdmin.
4. Buka `http://localhost/adrian-laptop-kp/login.php`.

## Environment Variables untuk Vercel
Buat MySQL/MariaDB online terlebih dahulu, lalu di Vercel isi:

- `DB_HOST`
- `DB_PORT` (umumnya `3306`)
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

Opsional:
- `DB_DSN` — jika provider memberikan DSN PDO khusus.
- `DB_SSL_CA` — path CA certificate jika provider mewajibkannya.

Jangan memasukkan password database asli ke source code atau GitHub.

## Import database online
Import file `database/adrian_laptop_kp.sql` ke database MySQL online. File ini berisi struktur dan data awal project.

## Deploy melalui GitHub → Vercel
1. Upload isi folder V6 ke repository GitHub.
2. Di Vercel pilih **Add New > Project** lalu import repository tersebut.
3. Vercel akan mendeteksi `Dockerfile.vercel` sebagai container deployment.
4. Masukkan semua Environment Variables database pada Project Settings.
5. Deploy.
6. Setelah deployment selesai, buka `/health.php` pada domain Vercel. Jika berhasil akan tampil `database: connected`.
7. Buka `/login.php` dan login menggunakan akun project.

## Catatan penting
Database MySQL XAMPP di laptop tidak dapat digunakan oleh deployment Vercel. Deployment online membutuhkan database online/persisten. Container Vercel bersifat stateless, jadi jangan menyimpan data persisten ke filesystem container.

## Akun awal
- Owner: `boss` / `boss123`
- Admin: `admin` / `admin123`
- Staff: `staff` / `staff123`
- Warranty: `warranty` / `warranty123`

Untuk deployment yang benar-benar publik, ganti password akun awal setelah database berhasil di-import.
