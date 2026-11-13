'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAction, branchAllowed } from '@/lib/context';
import { mutate } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { parse, safe, uuid, type ActionState } from '@/lib/action';

const COND = z.enum(['baru', 'bekas_baik', 'bekas_cukup', 'perlu_perbaikan', 'belum_diperiksa']);
const ok = (message: string): ActionState => ({ ok: true, message });
type Ctx = Awaited<ReturnType<typeof requireAction>>;
const needBranch = (ctx: Ctx, id: string) => { if (!branchAllowed(ctx, id)) throw new AppError('forbidden', 'Anda tidak memiliki akses ke cabang ini.'); };

/** Barang masuk: 1 unit berseri (pemasok, referensi, catatan, tanggal tercatat). */
export async function receiveGoodsUnitAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ product_id: uuid, branch_id: uuid, serial: z.string().max(80).optional(), condition: COND, received_at: z.string().optional(),
      cost: z.coerce.number().min(0).optional(), supplier: z.string().max(120).optional(), ref: z.string().max(80).optional(), notes: z.string().max(500).optional() }), fd);
    needBranch(ctx, v.branch_id);
    await mutate('receive_goods(unit)', () => ctx.sb.rpc('receive_goods', { p_branch: v.branch_id, p_product: v.product_id, p_serial: v.serial ?? null, p_condition: v.condition,
      p_date: v.received_at ?? null, p_cost: v.cost ?? null, p_qty: 1, p_supplier: v.supplier ?? null, p_ref: v.ref ?? null, p_note: v.notes ?? null }));
    revalidatePath('/inventory', 'layout');
    return ok('Barang masuk tercatat. Stok cabang bertambah.');
  });
}

/** Barang masuk: aksesori (kuantitas). */
export async function receiveGoodsQtyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ product_id: uuid, branch_id: uuid, qty: z.coerce.number().int().min(1, 'Jumlah minimal 1'), received_at: z.string().optional(),
      supplier: z.string().max(120).optional(), ref: z.string().max(80).optional(), reason: z.string().max(200).optional() }), fd);
    needBranch(ctx, v.branch_id);
    await mutate('receive_goods(qty)', () => ctx.sb.rpc('receive_goods', { p_branch: v.branch_id, p_product: v.product_id, p_serial: null, p_condition: 'baru',
      p_date: v.received_at ?? null, p_cost: null, p_qty: v.qty, p_supplier: v.supplier ?? null, p_ref: v.ref ?? null, p_note: v.reason ?? null }));
    revalidatePath('/inventory', 'layout');
    return ok('Barang masuk tercatat. Stok bertambah.');
  });
}

/** Barang keluar (di luar penjualan). item = "productId:unitId" (berseri) atau "productId" (kuantitas). */
export async function issueStockAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ branch_id: uuid, item: z.string().min(36, 'Pilih barang'), qty: z.coerce.number().int().min(1).optional(),
      reason: z.enum(['rusak', 'internal', 'hilang', 'lainnya']), date: z.string().optional(), note: z.string().max(300).optional() }), fd);
    needBranch(ctx, v.branch_id);
    const [pid, uid] = v.item.split(':');
    const pidOk = z.string().uuid().safeParse(pid).success, uidOk = uid === undefined || z.string().uuid().safeParse(uid).success;
    if (!pidOk || !uidOk) throw new AppError('validation', 'Barang tidak valid.');
    if (!uid && !v.qty) throw new AppError('validation', 'Isi jumlah barang keluar.');
    await mutate('issue_stock', () => ctx.sb.rpc('issue_stock', { p_branch: v.branch_id, p_product: pid, p_unit: uid ?? null, p_qty: uid ? 1 : v.qty ?? 0,
      p_reason: v.reason, p_date: v.date ?? null, p_note: v.note ?? null }));
    revalidatePath('/inventory', 'layout');
    return ok('Barang keluar tercatat. Stok cabang berkurang.');
  });
}

/** Atur batas stok minimal produk (untuk halaman Stok Menipis). */
export async function setMinStockAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ product_id: uuid, min_stock: z.coerce.number().int().min(0).optional() }), fd);
    await mutate('min_stock', () => ctx.sb.from('products').update({ min_stock: v.min_stock ?? null }).eq('id', v.product_id));
    revalidatePath('/inventory', 'layout');
    return ok(v.min_stock == null ? 'Batas minimal dihapus.' : 'Batas minimal disimpan.');
  });
}

/** Transfer: buat permintaan (status Menunggu; stok belum bergerak). */
export async function requestTransferAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ from: uuid, to: uuid, note: z.string().max(300).optional() }), fd);
    needBranch(ctx, v.from);
    const items: { product_id: string; unit_id?: string; qty?: number }[] = [];
    for (const u of fd.getAll('unit')) { const [pid, uid] = String(u).split(':'); if (pid && uid) items.push({ product_id: pid, unit_id: uid }); }
    fd.forEach((val, key) => { if (key.startsWith('qty_') && Number(val) > 0) items.push({ product_id: key.slice(4), qty: Math.floor(Number(val)) }); });
    if (!items.length) throw new AppError('validation', 'Pilih minimal satu unit atau isi jumlah aksesori.');
    await mutate('request_transfer', () => ctx.sb.rpc('request_transfer', { p_from: v.from, p_to: v.to, p_items: items, p_note: v.note ?? null }));
    revalidatePath('/inventory', 'layout');
    return ok('Permintaan transfer dibuat (Menunggu). Klik “Kirim” untuk memproses pengiriman.');
  });
}

/** Transfer: kirim (Menunggu -> Dalam Pengiriman); stok cabang asal berkurang. */
export async function dispatchTransferAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ id: uuid }), fd);
    await mutate('dispatch_transfer', () => ctx.sb.rpc('dispatch_transfer', { p_id: v.id }));
    revalidatePath('/inventory', 'layout');
    return ok('Transfer dikirim. Stok cabang asal berkurang; cabang tujuan perlu menerima.');
  });
}
