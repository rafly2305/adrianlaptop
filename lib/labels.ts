export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute' | 'demo';

export const UNIT_STATUS: Record<string, [string, Tone]> = {
  available: ['Tersedia', 'ok'], reserved: ['Dipesan', 'info'], sold: ['Terjual', 'mute'], damaged: ['Rusak', 'bad'],
  returned: ['Retur', 'warn'], in_warranty: ['Proses Garansi', 'warn'], in_transit: ['Dalam Perjalanan', 'info'], archived: ['Diarsipkan', 'mute'],
};
export const CONDITION: Record<string, string> = {
  baru: 'Baru', bekas_baik: 'Bekas - Baik', bekas_cukup: 'Bekas - Cukup', perlu_perbaikan: 'Perlu Perbaikan', belum_diperiksa: 'Belum Diperiksa',
};
export const SERIAL_STATUS: Record<string, [string, Tone]> = {
  belum_ada: ['Serial belum ada', 'warn'], belum_diverifikasi: ['Belum diverifikasi', 'warn'],
  terverifikasi: ['Terverifikasi', 'ok'], sintetis_demo: ['Sintetis (demo)', 'demo'],
};
export const SALE_STATUS: Record<string, [string, Tone]> = {
  completed: ['Selesai', 'ok'], partially_returned: ['Retur Sebagian', 'warn'], returned: ['Diretur', 'warn'], void: ['Dibatalkan', 'bad'],
};
export const PAY_STATUS: Record<string, [string, Tone]> = { paid: ['Lunas', 'ok'], partial: ['Sebagian', 'warn'], unpaid: ['Belum Bayar', 'bad'] };
export const TICKET_STATUS: Record<string, [string, Tone]> = {
  baru: ['Baru', 'info'], diproses: ['Diproses', 'warn'], menunggu_spare_part: ['Menunggu Spare Part', 'warn'],
  menunggu_pelanggan: ['Menunggu Pelanggan', 'warn'], selesai: ['Selesai', 'ok'], ditolak: ['Ditolak', 'bad'],
};
export const WARRANTY_STATE: Record<string, [string, Tone]> = {
  aktif: ['Garansi Aktif', 'ok'], berakhir: ['Garansi Berakhir', 'bad'], belum_diverifikasi: ['Garansi Belum Diverifikasi', 'warn'], tidak_ada: ['Tanpa Unit Terkait', 'mute'],
};
export const TRANSFER_STATUS: Record<string, [string, Tone]> = { in_transit: ['Dalam Perjalanan', 'info'], received: ['Diterima', 'ok'], cancelled: ['Dibatalkan', 'bad'] };
export const MOVEMENT: Record<string, string> = {
  receive: 'Penerimaan', issue: 'Pengeluaran', sale: 'Penjualan', sale_void: 'Batal Jual', return: 'Retur', adjust: 'Penyesuaian',
  transfer_out: 'Transfer Keluar', transfer_in: 'Transfer Masuk', transfer_cancel: 'Transfer Dibatalkan',
};
export const TICKET_CATEGORIES = ['Tidak menyala', 'Layar bermasalah', 'Baterai / charger', 'Keyboard / touchpad', 'Performa lambat', 'Software / OS', 'Kerusakan fisik', 'Lainnya'];
