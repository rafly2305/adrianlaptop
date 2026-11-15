-- LANGKAH 2 dari 4 — Nilai enum status transfer. (= migration 0006)
-- WAJIB dijalankan SENDIRI (satu kali Run) dan harus sukses sebelum langkah 3, karena nilai enum baru harus ter-commit lebih dulu.

-- 0006_transfer_pending.sql — JALANKAN TERPISAH LEBIH DULU (nilai enum baru harus ter-commit sebelum dipakai).
alter type transfer_status add value if not exists 'pending';
