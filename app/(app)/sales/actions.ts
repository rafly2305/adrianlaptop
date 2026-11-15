'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAction, branchAllowed } from '@/lib/context';
import { mutate, run } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { parse, safe, uuid, type ActionState } from '@/lib/action';

export async function voidSaleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('sales.void');
    const v = parse(z.object({ id: uuid, reason: z.string().min(3, 'Alasan wajib diisi (min. 3 karakter)').max(300) }), fd);
    await mutate('void_sale', () => ctx.sb.rpc('void_sale', { p_sale: v.id, p_reason: v.reason }));
    revalidatePath(`/sales/${v.id}`); revalidatePath('/inventory', 'layout');
    return { ok: true, message: 'Transaksi dibatalkan; stok dikembalikan.' };
  });
}

export async function returnItemAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('sales.return');
    const v = parse(z.object({ item_id: uuid, sale_id: uuid, qty: z.coerce.number().int().min(1), reason: z.string().min(3, 'Alasan wajib diisi (min. 3 karakter)').max(300), refund: z.coerce.number().min(0).default(0) }), fd);
    await mutate('return_sale_item', () => ctx.sb.rpc('return_sale_item', { p_item: v.item_id, p_qty: v.qty, p_reason: v.reason, p_refund: v.refund }));
    revalidatePath(`/sales/${v.sale_id}`); revalidatePath('/inventory', 'layout');
    return { ok: true, message: 'Retur tercatat. Unit berseri berstatus “Retur” sampai diperiksa.' };
  });
}

const pct = z.number().min(0, 'Persentase tidak boleh negatif').max(100, 'Persentase maksimal 100%')
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Persentase maksimal 2 angka desimal');

const posSchema = z.object({
  request_id: uuid,
  branch_id: uuid,
  customer: z.object({ name: z.string().max(120).optional(), phone: z.string().max(30).optional(), address: z.string().max(300).optional() }),
  // Harga/diskon per-item dari klien TIDAK dipakai: harga selalu diambil dari database oleh fungsi create_sale_pos.
  items: z.array(z.object({ product_id: uuid, unit_id: z.string().uuid().optional(), qty: z.number().int().min(1).max(1000) })).min(1, 'Keranjang kosong').max(100),
  discount_percent: pct.default(0),
  tax_percent: pct.default(0),
  method: z.enum(['Tunai', 'QRIS', 'Transfer Bank', 'Kartu Debit'], { errorMap: () => ({ message: 'Pilih metode pembayaran' }) }),
  tendered: z.number().min(0).max(1e11).optional(),
  verified: z.boolean().default(false),
  reference: z.string().max(100).optional(),
  pay_note: z.string().max(200).optional(),
  notes: z.string().max(300).optional(),
});

/**
 * Transaksi POS. Subtotal, diskon %, pajak %, total, dan kembalian dihitung ulang di database.
 * Mengembalikan data transaksi yang BENAR-BENAR tersimpan; klien baru menampilkan "Pembayaran Berhasil" setelah ini ok.
 */
export async function createSalePosAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('pos.sell');
    let raw: unknown;
    try { raw = JSON.parse(String(fd.get('payload') ?? '')); } catch { throw new AppError('validation', 'Data transaksi tidak terbaca.'); }
    const r = posSchema.safeParse(raw);
    if (!r.success) throw new AppError('validation', r.error.issues[0]?.message ?? 'Data transaksi tidak valid.');
    const v = r.data;
    if (!branchAllowed(ctx, v.branch_id)) throw new AppError('forbidden', 'Anda tidak memiliki akses ke lokasi ini.');
    const isCash = v.method === 'Tunai';
    const id = await mutate<string>('create_sale_pos', () => ctx.sb.rpc('create_sale_pos', {
      p_branch: v.branch_id, p_customer: v.customer, p_items: v.items, p_method: v.method, p_tendered: isCash ? v.tendered ?? 0 : null,
      p_reference: v.reference ?? null, p_pay_note: v.pay_note ?? null, p_discount_percent: v.discount_percent, p_tax_percent: v.tax_percent,
      p_verified: isCash ? true : v.verified, p_request_id: v.request_id, p_notes: v.notes ?? null }));
    // Baca ulang dari database: popup hanya memakai nilai yang benar-benar tersimpan.
    const saved = await run<{ id: string; invoice_no: string; total: number; payment_method: string | null; payment_status: string } | null>('baca transaksi',
      () => ctx.sb.from('sales').select('id,invoice_no,total,payment_method,payment_status').eq('id', id).maybeSingle());
    if (!saved) throw new AppError('db', 'Transaksi tidak ditemukan setelah disimpan. Periksa Riwayat Transaksi sebelum mengulang.');
    revalidatePath('/sales'); revalidatePath('/inventory', 'layout'); revalidatePath('/');
    return { ok: true, message: 'Pembayaran berhasil disimpan.', data: { id: saved.id, invoice_no: saved.invoice_no, total: Number(saved.total), method: saved.payment_method, status: saved.payment_status } };
  });
}
