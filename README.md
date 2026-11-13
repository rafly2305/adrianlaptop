# Adrian Laptop Store — Sistem Informasi Penjualan, Inventory, Customer Service & Warranty

Aplikasi internal (bukan marketplace). Next.js 15 (App Router) + TypeScript + Tailwind + Supabase (PostgreSQL, Auth, RLS) di Vercel.

> **Status jujur:** kode ini ditulis tanpa akses internet/PostgreSQL di lingkungan penyusun, jadi **belum pernah di-build atau dijalankan**. Yang sudah diverifikasi: sintaks TypeScript (0 error sintaks), keseimbangan SQL, dan konsistensi seed (49 unit Cidodol, 46 pcs aksesori, simulasi stok demo). Lihat `docs/TESTING.md` untuk daftar yang **wajib Anda jalankan** sebelum go-live.

## Struktur
```
app/                 halaman (login, dashboard, inventory, pos, sales, service, warranty, reports, settings, search, api)
components/          UI (Shell, ActionForm, PosClient, Charts, …)
lib/                 env, db (retry terbatas), errors terpusat, permissions, konteks cabang/role
supabase/migrations/ 0001 skema · 0002 RLS · 0003 fungsi transaksional · 0004 audit trigger
supabase/seed/       00 dasar · 01 Cidodol (nyata) · 02 demo (sintetis) · 99 reset demo
supabase/tests/      rls_and_rpc_test.sql (dijalankan di staging, di-rollback)
scripts/             gen_seed.py (pembuat seed) · bootstrap-admin.mjs (Super Admin pertama)
docs/                DEPLOY.md · TESTING.md · MIGRASI_DARI_PHP.md
```

## Prinsip desain
- **Cabang & role di database, bukan di UI.** RLS memakai `user_branch_access` + role. Login saja tidak memberi akses.
- **Mutasi kritis = fungsi Postgres transaksional** (`create_sale`, `void_sale`, `return_sale_item`, `create_transfer`, `receive_transfer`, `adjust_stock`, `receive_unit`, …) dengan row lock. Unit berseri tidak bisa terjual dua kali (juga dijaga unique index parsial). Stok tidak bisa negatif (CHECK + validasi).
- **Data nyata vs demo:** kolom `data_origin` di semua tabel operasional. Aplikasi default menampilkan **data nyata**; pindah ke demo lewat pemilih di header (bertanda MODE DEMO). Transfer real↔demo ditolak. `supabase/seed/99_reset_demo.sql` / tombol Reset di Pengaturan hanya menghapus demo.
- **Nomor seri:** `serial_number` (asli, unik, boleh kosong) dipisah dari `internal_asset_code` (`UNIT-CDL-000001`). Status: belum ada / belum diverifikasi / terverifikasi / sintetis demo. Tidak ada nomor seri karangan.
- **Error database tidak disamarkan jadi “kosong”**: query gagal → halaman error + tombol coba lagi; retry hanya untuk gangguan sementara (maks 2x), timeout 10 dtk; detail teknis hanya di log server.
- **Rahasia:** `SUPABASE_SERVICE_ROLE_KEY` hanya dibaca di server (`lib/supabase/admin.ts`, `server-only`). Tidak ada password default di kode.

## Role
| Role | Cakupan |
|---|---|
| Super Admin/CEO | semua cabang, pengaturan, akun, reset demo |
| Admin cabang | inventory, POS, void/retur, service, laporan — cabangnya saja |
| Staf Inventory | penerimaan, serial, penyesuaian, transfer |
| Sales | POS (diskon dibatasi pengaturan), retur, tiket |
| CS/Warranty | tiket & garansi |
| Finance | transaksi & laporan (baca) |
| HR | tersedia sebagai role; **belum punya modul** (fitur lama tidak memerlukannya) dan tidak dapat membaca data toko |

## Yang sengaja belum ditetapkan (butuh keputusan pemilik)
Harga beli/jual, tanggal masuk, pemasok, serial pabrikan, aturan masa garansi toko, batas diskon Sales (default 0%), batas stok minimal per produk. Semuanya kosong/“belum diverifikasi” sampai diisi di aplikasi — **tidak diisi dengan angka tebakan**.
