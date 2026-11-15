# Pengujian

## Sudah dilakukan (di lingkungan penyusun revisi ini)
Lingkungan tanpa internet & PostgreSQL: `npm install`, `next build`, dan database **tidak dapat dijalankan**.
- `lib/pos-calc.ts` (rumus diskon/pajak) dijalankan dengan Node: contoh Rp5.000.000, diskon 10%, pajak 11% → diskon 500.000, setelah diskon 4.500.000, pajak 495.000, **total 4.995.000** (sesuai contoh). 200.000 kasus acak dibandingkan dengan aritmetika BigInt eksak: **0 selisih**. Validasi persen (negatif, >100, >2 desimal) diuji.
- Pemeriksaan TypeScript dengan stub modul eksternal: menemukan & memperbaiki 1 kesalahan sintaks; sisa peringatan hanya artefak stub (bukan dari kode revisi).
- Seed Cidodol dibuat ulang: `01_cidodol.sql` identik byte-per-byte dengan sebelum revisi (49 unit, 46 pcs aksesori).
- Penelusuran teks: tidak ada lagi `DemoTag`, `ScopeControls`, pemilih data demo, atau tulisan “Multi-Cabang” di kode UI.

## BELUM diuji — wajib Anda jalankan (urut)
| # | Tes | Cara |
|---|---|---|
| 1 | `npm install && npm run typecheck && npm run lint && npm run build` | Harus sukses |
| 2 | Jalankan `0008_single_location_pos.sql` di Supabase staging/SQL Editor | Tanpa error; cek 3 query di akhir file |
| 3 | `supabase/tests/pos_test.sql` | Selesai tanpa error (rollback otomatis) |
| 4 | Login/logout; akun & Logout di dasar sidebar (desktop, collapsed, HP) | Manual |
| 5 | POS Tunai/QRIS/Transfer/Debit, diskon & pajak, popup “Pembayaran Berhasil!”, detail transaksi, cetak struk/invoice | Manual (isi QRIS & rekening di Pengaturan dulu) |
| 6 | Klik “Konfirmasi pembayaran” berkali-kali / refresh saat memproses | Harus hanya 1 transaksi |
| 7 | Role Kasir: diskon > batas & pajak berbeda ditolak | Manual |
| 8 | CRUD produk/unit/stok/service/garansi, pencarian, ekspor CSV | Manual |
| 9 | Tampilan HP/tablet semua halaman | DevTools responsive / perangkat nyata |
