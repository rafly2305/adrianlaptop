'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAction, branchAllowed } from '@/lib/context';
import { mutate } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { parse, safe, uuid, type ActionState } from '@/lib/action';

const payloadSchema = z.object({
  branch_id: uuid,
  customer: z.object({ name: z.string().max(120).optional(), phone: z.string().max(30).optional(), address: z.string().max(300).optional() }),
  items: z.array(z.object({ product_id: uuid, unit_id: z.string().uuid().optional(), qty: z.number().int().min(1).max(1000), unit_price: z.number().min(0).max(1e10), discount: z.number().min(0).max(1e10) })).min(1, 'Keranjang kosong').max(100),
  method: z.string().max(40).optional(),
  pay: z.enum(['full', 'partial', 'none']),
  paid: z.number().min(0).optional(),
  notes: z.string().max(300).optional(),
});

export async function createSaleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('pos.sell');
    let raw: unknown;
    try { raw = JSON.parse(String(fd.get('payload') ?? '')); } catch { throw new AppError('validation', 'Data transaksi tidak terbaca.'); }
    const r = payloadSchema.safeParse(raw);
    if (!r.success) throw new AppError('validation', r.error.issues[0]?.message ?? 'Data transaksi tidak valid.');
    const v = r.data;
    if (!branchAllowed(ctx, v.branch_id)) throw new AppError('forbidden', 'Anda tidak memiliki akses ke cabang ini.');
    // Harga/total dihitung ulang di database; nilai dari klien hanya masukan.
    const paid = v.pay === 'full' ? null : v.pay === 'none' ? 0 : v.paid ?? 0;
    const id = await mutate<string>('create_sale', () => ctx.sb.rpc('create_sale', {
      p_branch: v.branch_id, p_customer: v.customer, p_items: v.items, p_method: v.pay === 'none' ? v.method ?? null : v.method ?? null, p_paid: paid, p_notes: v.notes ?? null }));
    revalidatePath('/sales'); revalidatePath('/inventory', 'layout'); revalidatePath('/');
    redirect(`/sales/${id}`);
  });
}

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

const posSchema = z.object({
  branch_id: uuid,
  customer: z.object({ name: z.string().max(120).optional(), phone: z.string().max(30).optional(), address: z.string().max(300).optional() }),
  items: z.array(z.object({ product_id: uuid, unit_id: z.string().uuid().optional(), qty: z.number().int().min(1).max(1000), unit_price: z.number().min(0).max(1e10), discount: z.number().min(0).max(1e10) })).min(1, 'Keranjang kosong').max(100),
  discount_percent: z.number().min(0, 'Diskon minimal 0%').max(100, 'Diskon maksimal 100%').default(0),
  tax_percent: z.number().min(0, 'Pajak minimal 0%').max(100, 'Pajak maksimal 100%').default(0),
  kind: z.enum(['cash', 'noncash']),
  method: z.string().min(1, 'Pilih metode pembayaran').max(40),
  tendered: z.number().min(0).max(1e11).optional(),
  reference: z.string().max(100).optional(),
  pay_note: z.string().max(200).optional(),
  notes: z.string().max(300).optional(),
});

/** Transaksi POS: pembayaran Tunai/Non-Tunai, selalu LUNAS. Total, pajak, dan kembalian dihitung ulang di database. */
export async function createSalePosAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('pos.sell');
    let raw: unknown;
    try { raw = JSON.parse(String(fd.get('payload') ?? '')); } catch { throw new AppError('validation', 'Data transaksi tidak terbaca.'); }
    const r = posSchema.safeParse(raw);
    if (!r.success) throw new AppError('validation', r.error.issues[0]?.message ?? 'Data transaksi tidak valid.');
    const v = r.data;
    if (!branchAllowed(ctx, v.branch_id)) throw new AppError('forbidden', 'Anda tidak memiliki akses ke cabang ini.');
    const isCash = v.kind === 'cash';
    if (isCash && v.method.toLowerCase() !== 'tunai') throw new AppError('validation', 'Metode tunai tidak valid.');
    if (!isCash && v.method.toLowerCase() === 'tunai') throw new AppError('validation', 'Pilih metode non-tunai.');
    const id = await mutate<string>('create_sale_pos', () => ctx.sb.rpc('create_sale_pos', {
      p_branch: v.branch_id, p_customer: v.customer, p_items: v.items, p_method: v.method, p_tendered: isCash ? v.tendered ?? 0 : null,
      p_reference: v.reference ?? null, p_pay_note: v.pay_note ?? null, p_discount_pct: v.discount_percent, p_tax_pct: v.tax_percent, p_notes: v.notes ?? null }));
    // Sampai di sini hanya bila RPC berhasil (transaksi sudah tersimpan); kegagalan melempar error sebelum ini.
    const sale = await ctx.sb.from('sales').select('invoice_no,total').eq('id', id).maybeSingle();
    revalidatePath('/sales'); revalidatePath('/inventory', 'layout'); revalidatePath('/');
    return { ok: true, message: 'Pembayaran berhasil.', saleId: id, invoice: sale.data?.invoice_no ?? '', total: Number(sale.data?.total ?? 0) };
  });
}
