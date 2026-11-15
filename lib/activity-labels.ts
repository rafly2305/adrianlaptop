import { rupiah } from './format';

export type ActType = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'RETURN' | 'VOID';
type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute' | 'demo';

export const TYPE_TONE: Record<ActType, Tone> = { CREATE: 'ok', UPDATE: 'info', DELETE: 'bad', LOGIN: 'mute', LOGOUT: 'mute', RETURN: 'warn', VOID: 'bad' };
export const TYPE_LABEL: Record<ActType, string> = { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', LOGIN: 'LOGIN', LOGOUT: 'LOGOUT', RETURN: 'RETURN', VOID: 'BATAL' };

/** Nama modul ditentukan dari kolom `entity`. */
export const MODULES: Record<string, string> = {
  auth: 'Autentikasi', products: 'Produk & Stok', inventory_units: 'Unit Inventory', sales: 'Penjualan',
  stock_transfers: 'Transfer Barang', service_tickets: 'Customer Service', profiles: 'User Management',
  user_branch_access: 'User Management', stock_opnames: 'Stok Opname', branches: 'Pengaturan', app_settings: 'Pengaturan', users: 'User Management', system: 'Sistem',
};
export const MODULE_FILTER: Record<string, string[]> = {
  auth: ['auth'], produk: ['products'], unit: ['inventory_units'], penjualan: ['sales'], transfer: ['stock_transfers'],
  service: ['service_tickets'], opname: ['stock_opnames'], user: ['profiles', 'user_branch_access', 'users'], pengaturan: ['branches', 'app_settings'], sistem: ['system'],
};
export const MODULE_FILTER_LABEL: Record<string, string> = {
  auth: 'Autentikasi', produk: 'Produk & Stok', unit: 'Unit Inventory', penjualan: 'Penjualan', transfer: 'Transfer Barang',
  service: 'Customer Service', opname: 'Stok Opname', user: 'User Management', pengaturan: 'Pengaturan', sistem: 'Sistem',
};

const ACTIONS: Record<string, ActType> = {
  'auth.login': 'LOGIN', 'auth.logout': 'LOGOUT',
  insert: 'CREATE', update: 'UPDATE', delete: 'DELETE',
  'unit.receive': 'CREATE', 'qty.receive': 'CREATE', 'stock.adjust': 'UPDATE', 'unit.status': 'UPDATE', 'unit.update': 'UPDATE', 'unit.serial': 'UPDATE',
  'sale.create': 'CREATE', 'sale.pos': 'CREATE', 'sale.void': 'VOID', 'sale.return': 'RETURN',
  'transfer.create': 'CREATE', 'transfer.receive': 'UPDATE', 'transfer.cancel': 'VOID',
  'ticket.create': 'CREATE', 'ticket.status': 'UPDATE',
  'user.create': 'CREATE', 'user.update': 'UPDATE', 'user.activate': 'UPDATE', 'user.deactivate': 'UPDATE', 'user.reset_password': 'UPDATE',
  'stock.issue': 'UPDATE', 'opname.create': 'CREATE', 'opname.confirm': 'UPDATE', 'opname.cancel': 'VOID',
  'transfer.request': 'CREATE', 'transfer.dispatch': 'UPDATE',
  'demo.reset': 'DELETE',
};
export const typeOf = (action: string): ActType => ACTIONS[action] ?? 'UPDATE';
export const actionsOfType = (t: string): string[] => Object.entries(ACTIONS).filter(([, v]) => v === t).map(([k]) => k);
export const ALL_TYPES = Object.keys(TYPE_LABEL) as ActType[];

type D = Record<string, unknown>;
const str = (v: unknown) => (v == null ? '' : String(v));
const FIELD_ID: Record<string, string> = { full_name: 'nama', role: 'peran', active: 'status aktif', name: 'nama', price: 'harga', sku: 'SKU', city: 'kota', value: 'nilai', min_stock: 'stok minimum' };

export function referenceOf(action: string, d: D): string {
  const after = (d.after ?? d.before ?? {}) as D;
  return str(d.invoice ?? d.number ?? d.no ?? d.code ?? d.email ?? after.sku ?? after.full_name ?? after.name ?? after.key ?? '');
}

export function describe(action: string, entity: string | null, d: D): string {
  switch (action) {
    case 'auth.login': return 'Masuk ke sistem';
    case 'auth.logout': return 'Keluar dari sistem';
    case 'sale.pos': return `Transaksi POS ${str(d.invoice)} (${str(d.method)}) senilai ${rupiah(d.total as number)}`;
    case 'sale.create': return `Membuat transaksi ${str(d.invoice)} senilai ${rupiah(d.total as number)}`;
    case 'sale.void': return `Membatalkan transaksi ${str(d.invoice)}${d.reason ? ` — ${str(d.reason)}` : ''}`;
    case 'sale.return': return `Retur ${str(d.qty)} item${d.refund ? `, pengembalian ${rupiah(d.refund as number)}` : ''}${d.reason ? ` — ${str(d.reason)}` : ''}`;
    case 'unit.receive': return `Menerima unit ${str(d.code)}${d.serial ? ` (SN ${str(d.serial)})` : ''}`;
    case 'qty.receive': return `Menerima ${str(d.qty)} pcs`;
    case 'stock.adjust': return `Penyesuaian stok ${str(d.delta)} (dari ${str(d.from)})${d.reason ? ` — ${str(d.reason)}` : ''}`;
    case 'unit.status': return `Status unit ${str(d.from)} → ${str(d.to)}${d.reason ? ` — ${str(d.reason)}` : ''}`;
    case 'unit.update': return 'Memperbarui data unit';
    case 'unit.serial': return 'Memperbarui nomor seri unit';
    case 'transfer.create': return `Membuat transfer ${str(d.number)}`;
    case 'transfer.receive': return `Menerima transfer ${str(d.number)}`;
    case 'transfer.cancel': return `Membatalkan transfer${d.reason ? ` — ${str(d.reason)}` : ''}`;
    case 'ticket.create': return `Membuat tiket ${str(d.no)}`;
    case 'ticket.status': return `Status tiket ${str(d.from)} → ${str(d.to)}`;
    case 'user.create': return `Membuat akun ${str(d.email)}${d.role ? ` (${str(d.role)})` : ''}`;
    case 'user.update': return `Mengubah akun ${str(d.name ?? d.email)}`;
    case 'user.activate': return `Mengaktifkan akun ${str(d.name)}`;
    case 'user.deactivate': return `Menonaktifkan akun ${str(d.name)}`;
    case 'user.reset_password': return `Mengatur ulang password ${str(d.name)}`;
    case 'stock.issue': return `Barang keluar ${str(d.no)}: ${str(d.qty)} pcs — ${str(d.reason)}`;
    case 'opname.create': return `Memulai stok opname ${str(d.number)}`;
    case 'opname.confirm': return `Mengonfirmasi stok opname ${str(d.number)} (${str(d.adjusted)} penyesuaian)`;
    case 'opname.cancel': return `Membatalkan stok opname ${str(d.number)}`;
    case 'transfer.request': return `Mengajukan transfer ${str(d.number)}`;
    case 'transfer.dispatch': return `Mengirim transfer ${str(d.number)}`;
    case 'demo.reset': return 'Reset data demo';
  }
  const mod = MODULES[entity ?? ''] ?? entity ?? 'data';
  if (action === 'insert') return `Menambah data ${mod}`;
  if (action === 'delete') return `Menghapus data ${mod}`;
  if (action === 'update') {
    const b = (d.before ?? {}) as D, a = (d.after ?? {}) as D;
    const changed = Object.keys(a).filter((k) => k !== 'updated_at' && JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => FIELD_ID[k] ?? k);
    return `Mengubah data ${mod}${changed.length ? `: ${changed.slice(0, 4).join(', ')}` : ''}`;
  }
  return action;
}
