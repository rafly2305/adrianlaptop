# Adrian Laptop Store — Sistem Informasi Penjualan, Inventory, Customer Service & Warranty

Aplikasi internal (bukan marketplace). Next.js 15 (App Router) + TypeScript + Tailwind + Supabase (PostgreSQL, Auth, RLS) di Vercel.

> **Status:** perubahan terakhir (satu lokasi Cidodol, POS persen + 4 metode pembayaran) sudah diperiksa sintaks/logika perhitungannya, tetapi **build penuh, migration 0008, dan uji di browser harus dijalankan Anda** — lihat `docs/TESTING.md`.

## Struktur
```
app/                 halaman (login, dashboard, inventory, pos, sales, service, warranty, reports, settings, search, api)
components/          UI (Shell, ActionForm, PosClient, Charts, …)
lib/                 env, db (retry terbatas), errors terpusat, permissions, konteks cabang/role
supabase/migrations/ 0001 skema · 0002 RLS · 0003 fungsi transaksional · 0004 audit · 0005 harga · 0006 transfer · 0007 inventaris/POS · 0008 satu lokasi + POS persen/pembayaran · 0009 koreksi nama inventaris & harga estimasi
supabase/seed/       00 dasar (lokasi Cidodol) · 01 inventaris Cidodol (nyata) · 02 harga estimasi
database/            4 file SQL siap tempel di Supabase (LANGKAH-1…4) + PETUNJUK.md
supabase/tests/      pos_test.sql (aturan POS; dijalankan di staging, di-rollback)
scripts/             gen_seed.py (pembuat seed) · bootstrap-admin.mjs (Super Admin pertama)
docs/                DEPLOY.md · TESTING.md · MIGRASI_DARI_PHP.md
```

## Prinsip desain
- **Cabang & role di database, bukan di UI.** RLS memakai `user_branch_access` + role. Login saja tidak memberi akses.
- **Mutasi kritis = fungsi Postgres transaksional** (`create_sale`, `void_sale`, `return_sale_item`, `create_transfer`, `receive_transfer`, `adjust_stock`, `receive_unit`, …) dengan row lock. Unit berseri tidak bisa terjual dua kali (juga dijaga unique index parsial). Stok tidak bisa negatif (CHECK + validasi).
- **Satu lokasi (Cidodol):** aplikasi hanya melayani data operasional Cidodol. Tidak ada pilihan data demo atau cabang lain; migration 0008 membersihkan sisa data demo (hanya baris `data_origin='demo'`, data Cidodol tidak disentuh).
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
