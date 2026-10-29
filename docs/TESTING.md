# Pengujian

## Sudah diverifikasi (di lingkungan penyusun)
- Sintaks TypeScript semua file: **0 error sintaks** (tsc). Pemeriksaan tipe penuh **belum** bisa karena paket `next`/`react` tidak terpasang di sana.
- Kurung SQL seimbang di semua file; 21+ fungsi plpgsql terdefinisi.
- Seed Cidodol: 49 unit berseri (kode `UNIT-CDL-000001…049`), 7 produk aksesori = 46 pcs, SKU unik, nomor referensi 20 & 57 tidak dibuat.
- Simulasi data demo: saldo aksesori tidak negatif, saldo = jumlah pergerakan, jumlah unit terjual = jumlah penjualan aktif, nomor seri demo unik.

## BELUM diuji — wajib dijalankan Anda (urut)
| # | Tes | Cara |
|---|---|---|
| 1 | `npm run typecheck` | Perbaiki bila ada error tipe (kemungkinan: beberapa tipe hasil query Supabase, ketidakcocokan versi paket) |
| 2 | `npm run lint`, `npm run build` | Harus sukses |
| 3 | Migration 0001→0004 + seed di Supabase **staging** | Tidak ada error SQL |
| 4 | `supabase/tests/rls_and_rpc_test.sql` | Harus berakhir “SEMUA TES LULUS”. Mencakup: isolasi cabang, HR tak bisa baca data, tulis langsung ditolak, unit tidak bisa terjual 2×, diskon > batas ditolak, void mengembalikan unit, stok tak bisa negatif, transfer real→demo ditolak & transfer demo benar, serial ganda ditolak |
| 5 | Login/logout, akses halaman terlarang per role | Manual dengan 3–4 akun uji |
| 6 | Admin cabang A tidak melihat cabang B (UI + coba URL langsung) | Manual |
| 7 | Pencarian, filter, pagination, ekspor CSV (inventory & penjualan) | Manual |
| 8 | POS end-to-end: jual unit berseri → status Terjual, tidak muncul di pencarian POS, struk tercetak; jual aksesori; retur; void | Manual (gunakan **mode Demo**) |
| 9 | Impor CSV (validasi saja → simpan), input massal serial, duplikasi ditolak | Manual |
| 10 | Tiket → hubung ke unit → status garansi “belum diverifikasi” bila belum ada data | Manual |
| 11 | Dashboard: angka sama dengan Laporan untuk periode & cabang yang sama | Bandingkan manual |
| 12 | `/api/health`, matikan jaringan/ubah URL Supabase sementara ⇒ halaman error jelas (bukan kosong) | Manual di preview |
| 13 | Pastikan tidak ada secret di repo: `git grep -n "service_role\|SUPABASE_SERVICE"` hanya di `lib/`, `.env.example`, docs | Manual |
| 14 | Preview Vercel dengan env yang benar, lalu promote | Lihat DEPLOY.md |

## Risiko yang diketahui
- Nama relasi PostgREST (`stock_transfers_from_branch_id_fkey`, alias `profiles!assigned_to`) bergantung pada penamaan default Postgres; bila error “relationship not found”, sesuaikan nama FK dari pesan error.
- Versi paket di `package.json` memakai rentang caret dan belum dipasang; commit `package-lock.json` setelah `npm install` berhasil.
- Dashboard/laporan memotong 5.000/10.000 baris dan memberi peringatan; untuk volume lebih besar perlu agregasi SQL (view/RPC).
