-- LANGKAH 2 dari 4 — Nilai enum status transfer.
-- WAJIB dijalankan SENDIRI (satu kali Run) dan harus sukses sebelum langkah 3, karena nilai enum baru harus ter-commit lebih dulu.

alter type transfer_status add value if not exists 'pending';
