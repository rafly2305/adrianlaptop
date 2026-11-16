# Adrian Laptop Store — Sistem Informasi Penjualan, Inventory, Customer Service & Warranty

Aplikasi internal (bukan marketplace). Next.js 15 (App Router) + TypeScript + Tailwind + Supabase (PostgreSQL, Auth, RLS) di Vercel.

> **Status:** paket instalasi BARU (database Supabase kosong). Sintaks/logika perhitungan sudah diperiksa, tetapi **build penuh, SQL di PostgreSQL, dan uji di browser harus dijalankan Anda** — lihat `docs/TESTING.md`.

## Mulai cepat
1. Database: ikuti `database/PETUNJUK.md` (4 file SQL berurutan).
2. Deploy: ikuti `docs/DEPLOY.md` (GitHub → Vercel + 3 environment variable).

## Struktur
```
app/        halaman (login, dashboard, inventory, pos, sales, service, warranty, reports, settings, search, api)
components/ UI (Shell, ActionForm, PosClient, Charts, …)
lib/        env, db (retry terbatas), errors terpusat, permissions, konteks lokasi/role
database/   LANGKAH-1…4 (SQL siap tempel di Supabase) · PETUNJUK.md · tests/pos_test.sql · sumber-data/ (arsip daftar inventaris)
scripts/    bootstrap-admin.mjs (Super Admin pertama, alternatif dari SQL)
docs/       DEPLOY.md · TESTING.md
```

## Prinsip desain
- **Cabang & role di database, bukan di UI.** RLS memakai `user_branch_access` + role. Login saja tidak memberi akses.
- **Mutasi kritis = fungsi Postgres transaksional** (`create_sale`, `void_sale`, `return_sale_item`, `create_transfer`, `receive_transfer`, `adjust_stock`, `receive_unit`, …) dengan row lock. Unit berseri tidak bisa terjual dua kali (juga dijaga unique index parsial). Stok tidak bisa negatif (CHECK + validasi).
- **Satu lokasi (Cidodol):** aplikasi hanya melayani data operasional Cidodol. Tidak ada pilihan data demo atau cabang lain.
- **POS:** diskon & pajak dalam persen, dihitung ulang di database (round half-up ke rupiah). Harga selalu dari tabel `products`. Metode: Tunai, QRIS, Transfer Bank, Kartu Debit — non-tunai wajib diverifikasi kasir; `request_id` mencegah transaksi ganda. QRIS & rekening dikonfigurasi di Pengaturan (tidak ada data karangan).
- **Nomor seri:** `serial_number` (asli, unik, boleh kosong) dipisah dari `internal_asset_code` (`UNIT-CDL-000001`). Status: belum ada / belum diverifikasi / terverifikasi / sintetis demo. Tidak ada nomor seri karangan.
- **Error database tidak disamarkan jadi “kosong”**: query gagal → halaman error + tombol coba lagi; retry hanya untuk gangguan sementara (maks 2x), timeout 10 dtk; detail teknis hanya di log server.
- **Rahasia:** `SUPABASE_SERVICE_ROLE_KEY` hanya dibaca di server (`lib/supabase/admin.ts`, `server-only`). Tidak ada password default di kode.

## Role
| Role | Cakupan |
|---|---|
| Super Admin | pengaturan (QRIS, rekening, pajak), akun, semua fitur |
| Admin | inventaris, POS (diskon & pajak bebas 0–100%), void/retur, service, laporan |
| Staf Inventaris | penerimaan, serial, penyesuaian, opname |
| Kasir (sales) | POS (diskon dibatasi pengaturan, pajak sesuai tarif toko), retur, tiket |
| CS/Warranty | tiket & garansi |
| Finance | transaksi & laporan (baca) |
| HR | tersedia sebagai role; **belum punya modul** (fitur lama tidak memerlukannya) dan tidak dapat membaca data toko |

## Yang sengaja belum ditetapkan (butuh keputusan pemilik)
Harga beli/jual, tanggal masuk, pemasok, serial pabrikan, aturan masa garansi toko, batas diskon Sales (default 0%), batas stok minimal per produk. Semuanya kosong/“belum diverifikasi” sampai diisi di aplikasi — **tidak diisi dengan angka tebakan**.
