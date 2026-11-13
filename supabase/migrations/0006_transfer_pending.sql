-- 0006_transfer_pending.sql — JALANKAN TERPISAH LEBIH DULU (nilai enum baru harus ter-commit sebelum dipakai).
alter type transfer_status add value if not exists 'pending';
