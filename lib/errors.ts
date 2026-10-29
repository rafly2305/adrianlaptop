export type ErrorKind = 'config' | 'db' | 'auth' | 'forbidden' | 'validation' | 'rpc';

export class AppError extends Error {
  kind: ErrorKind;
  constructor(kind: ErrorKind, message: string, public detail?: unknown) {
    super(message);
    this.kind = kind;
  }
}

const RPC_MESSAGES: Record<string, string> = {
  not_authenticated: 'Sesi berakhir. Silakan login kembali.',
  forbidden_role: 'Peran Anda tidak diizinkan melakukan tindakan ini.',
  forbidden_branch: 'Anda tidak memiliki akses ke cabang ini.',
  branch_not_found: 'Cabang tidak ditemukan atau tidak aktif.',
  product_not_found: 'Produk tidak ditemukan.',
  product_not_serialized: 'Produk ini dikelola per kuantitas, bukan per nomor seri.',
  product_not_quantity: 'Produk ini berseri; gunakan penerimaan unit.',
  serial_duplicate: 'Nomor seri sudah terdaftar pada unit lain.',
  serial_demo_locked: 'Nomor seri data demo tidak dapat diubah.',
  unit_not_found: 'Unit tidak ditemukan.',
  unit_unavailable: 'Unit tidak tersedia (mungkin sudah terjual, dipesan, atau sedang dipindahkan).',
  insufficient_stock: 'Stok tidak mencukupi.',
  negative_stock: 'Penyesuaian akan membuat stok negatif.',
  invalid_qty: 'Jumlah tidak valid.',
  invalid_item: 'Item tidak valid (periksa harga, jumlah, atau diskon).',
  discount_over_limit: 'Diskon melebihi batas yang diizinkan untuk peran Anda.',
  empty_cart: 'Keranjang kosong.',
  serialized_qty_must_be_1: 'Barang berseri harus berjumlah 1 per baris.',
  invalid_payment_method: 'Metode pembayaran tidak dikenal.',
  payment_method_required: 'Pilih metode pembayaran.',
  reason_required: 'Alasan wajib diisi (minimal 3 karakter).',
  status_via_workflow: 'Status ini hanya dapat diubah lewat penjualan atau transfer.',
  sale_not_found: 'Transaksi tidak ditemukan.',
  sale_not_voidable: 'Transaksi ini tidak dapat dibatalkan (sudah dibatalkan atau memiliki retur).',
  item_not_found: 'Item transaksi tidak ditemukan.',
  item_not_returnable: 'Item ini tidak dapat diretur.',
  invalid_return_qty: 'Jumlah retur melebihi jumlah yang dibeli.',
  refund_exceeds: 'Nilai pengembalian melebihi nilai item.',
  invalid_branches: 'Cabang asal/tujuan tidak valid.',
  cross_origin_transfer: 'Tidak dapat memindahkan stok antara cabang demo dan cabang nyata.',
  transfer_not_found: 'Transfer tidak ditemukan.',
  transfer_not_pending: 'Transfer sudah diproses.',
  invalid_ticket: 'Data tiket belum lengkap.',
  ticket_not_found: 'Tiket tidak ditemukan.',
  resolution_required: 'Isi hasil penyelesaian sebelum menutup tiket.',
};

/** Pesan aman untuk pengguna. Detail teknis TIDAK ditampilkan (hanya di log server). */
export function friendly(e: unknown): string {
  if (e instanceof AppError) return e.message;
  const msg = (e as { message?: string })?.message ?? '';
  for (const key of Object.keys(RPC_MESSAGES)) if (msg.includes(key)) return RPC_MESSAGES[key];
  if ((e as { code?: string })?.code === '23505') return 'Data duplikat: nilai unik sudah dipakai.';
  if ((e as { code?: string })?.code === '23514') return 'Data melanggar aturan validasi database.';
  if ((e as { code?: string })?.code === '42501') return 'Tindakan ditolak oleh aturan akses data.';
  return 'Terjadi kesalahan pada server. Coba lagi; jika berulang, hubungi admin.';
}

export function isRedirect(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_REDIRECT');
}

export function isTransient(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? '');
  return /fetch failed|timeout|timed out|aborted|ECONN|ENOTFOUND|network|50[234]|temporarily/i.test(m);
}

/** Log server yang aman: tanpa kunci/nilai env. */
export function logServer(label: string, e: unknown) {
  const x = e as { code?: string; message?: string };
  console.error(`[adrian] ${label}`, { code: x?.code, message: String(x?.message ?? e).slice(0, 300) });
}
