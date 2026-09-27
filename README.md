# Sistem Informasi Adrian Laptop Store — Project KP

Website internal berbasis PHP + MySQL + Bootstrap 5 untuk POS, Inventory, Customer Service, Quality Control, dan Warranty. Fokus implementasi satu cabang.

## Instalasi XAMPP
1. Salin folder `adrian-laptop-kp` ke `C:\xampp\htdocs\`.
2. Jalankan Apache dan MySQL dari XAMPP Control Panel.
3. Buka phpMyAdmin (`http://localhost/phpmyadmin`).
4. Import `database/adrian_laptop_kp.sql`.
5. Pastikan `config/database.php` sesuai: host `localhost`, database `adrian_laptop_kp`, user `root`, password kosong (default XAMPP).
6. Buka `http://localhost/adrian-laptop-kp/login.php`.

## Instalasi Laragon
Letakkan folder di `C:\laragon\www\`, import SQL melalui HeidiSQL/phpMyAdmin, lalu akses URL project Laragon.

## Akun Testing

- Owner/Boss: `boss` / `boss123`
- Admin: `admin` / `admin123`
- Staff: `staff` / `staff123`
- Warranty: `warranty` / `warranty123`

## Alur Pengujian
1. Login sebagai Staff.
2. Inventory > Tambah Laptop.
3. Barang Masuk / QC > buat pengecekan unit.
4. POS > pilih unit tersedia > isi customer > proses transaksi.
5. Sistem membuat invoice, mengubah unit menjadi Terjual, dan membuat warranty 1 bulan.
6. Warranty > Ajukan Klaim.
7. Logout lalu login sebagai Petugas Warranty.
8. Klaim Warranty > Detail > isi pemeriksaan dan ubah status sampai Selesai/Ditolak.

## Catatan Data
Nama/model produk awal mengacu pada daftar inventory yang diberikan untuk project. Harga di seed database adalah **harga simulasi**, bukan harga asli Adrian Laptop Store. Jangan dipresentasikan sebagai data harga perusahaan.

## Struktur
- `index.php` — dashboard + modul utama/router sederhana
- `login.php`, `logout.php` — autentikasi
- `config/database.php` — koneksi PDO
- `includes/auth.php` — session, RBAC, CSRF, escaping
- `assets/` — CSS/JS
- `database/adrian_laptop_kp.sql` — schema + akun testing + seed

## Teknologi
PHP 8+, MySQL/MariaDB, Bootstrap 5 CDN, PDO prepared statements.


## Fitur V2
- Logo Adrian Laptop pada login dan sidebar
- Role Owner/Boss dengan dashboard monitoring
- Grafik penjualan dengan pilihan 30 Hari, Bulanan, dan Tahunan (lokal, tanpa Chart.js)
- Grafik model laptop terlaris
- Global search invoice/customer/unit/serial
- Notification center
- Activity log untuk Admin dan Owner
- Dashboard lebih modern dan informatif
- Sistem tetap difokuskan pada satu cabang objek KP

Catatan: nilai harga/omzet pada data demo memakai harga simulasi karena harga asli perusahaan tidak diberikan.

## Pembaruan V3
- Logo Adrian Laptop diperbarui sesuai file yang diberikan.
- Inventory mempertahankan 50 unit laptop dan nama dari daftar inventory sumber.
- Gambar/thumbnail laptop tersedia secara lokal pada setiap data inventory.
- Dashboard memiliki data transaksi awal agar grafik penjualan dan produk terlaris langsung terisi.
- Owner dapat melihat ringkasan performa 6 cabang: Cidodol, Ciledug, Meruya, Pamulang, Cisauk, dan Bintaro.
- Operasional inventory utama tetap berfokus pada Cabang Cidodol.


## V5
- Grafik Penjualan memiliki pilihan 30 Hari, Bulanan, dan Tahunan.
- Data awal tetap hanya menggunakan transaksi yang sudah tersedia (sekitar 30 hari terakhir); tidak ditambahkan transaksi palsu untuk bulan/tahun lama.
- Rekap bulanan dan tahunan otomatis berkembang ketika transaksi baru masuk ke database.

---

## V6 — Deployment Vercel
Versi ini sudah dilengkapi `Dockerfile.vercel` dan konfigurasi database berbasis Environment Variables. Panduan lengkap ada di `README-VERCEL.md`.
