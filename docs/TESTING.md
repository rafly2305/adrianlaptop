# Pengujian

## Sudah dilakukan oleh penyusun
Lingkungan penyusun tanpa internet dan tanpa PostgreSQL, sehingga `npm install`, `next build`, dan database **tidak dapat dijalankan** di sana.
- `lib/pos-calc.ts` (rumus diskon/pajak) dijalankan dengan Node: Rp5.000.000, diskon 10%, pajak 11% → diskon 500.000, setelah diskon 4.500.000, pajak 495.000, **total 4.995.000**. 200.000 kasus acak dibandingkan dengan aritmetika BigInt eksak: 0 selisih.
- File SQL diperiksa strukturnya (keseimbangan kurung, `$$`, begin/commit) dan jumlah data seed (30 produk, 49 unit, 46 pcs aksesori).

## BELUM diuji — jalankan sendiri (urut)
| # | Tes | Cara |
|---|---|---|
| 1 | `npm install && npm run typecheck && npm run lint && npm run build` | Harus sukses |
| 2 | `LANGKAH-1` → `2` → `3` → `4` di Supabase **uji** | Tanpa error; cek 5 kueri di `database/PETUNJUK.md` A.4 |
| 3 | `database/tests/pos_test.sql` (project uji) | Selesai tanpa error (rollback otomatis) |
| 4 | Login/logout; akun & Logout di dasar sidebar (desktop, collapsed, HP) | Manual |
| 5 | POS Tunai/QRIS/Transfer/Debit, diskon & pajak, popup "Pembayaran Berhasil!", detail transaksi, cetak struk/invoice | Manual (isi QRIS & rekening di Pengaturan dulu) |
| 6 | Klik "Konfirmasi pembayaran" berkali-kali / refresh saat memproses | Harus hanya 1 transaksi |
| 7 | Role Kasir: diskon > batas & pajak berbeda ditolak | Manual |
| 8 | CRUD produk/unit/stok/service/garansi, pencarian, ekspor CSV | Manual |
| 9 | Tampilan HP/tablet semua halaman | DevTools responsive / perangkat nyata |
