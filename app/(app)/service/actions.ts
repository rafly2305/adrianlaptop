'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAction, branchAllowed } from '@/lib/context';
import { mutate } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { parse, safe, uuid, type ActionState } from '@/lib/action';

const STATUS = z.enum(['baru', 'diproses', 'menunggu_spare_part', 'menunggu_pelanggan', 'selesai', 'ditolak']);

export async function createTicketAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('service.create');
    const v = parse(z.object({
      branch_id: uuid, customer_name: z.string().max(120).optional(), customer_phone: z.string().max(30).optional(), customer_address: z.string().max(300).optional(),
      unit_ref: z.string().max(80).optional(), sale_ref: z.string().max(60).optional(),
      category: z.string().min(2, 'Pilih jenis keluhan').max(60), description: z.string().min(3, 'Deskripsi masalah wajib diisi').max(2000), eta: z.string().optional(), assigned_to: z.string().uuid().optional(),
    }), fd);
    if (!branchAllowed(ctx, v.branch_id)) throw new AppError('forbidden', 'Anda tidak memiliki akses ke cabang ini.');
    let unitId: string | null = null, saleId: string | null = null;
    if (v.unit_ref) {
      const ref = v.unit_ref.trim().toUpperCase().replace(/[%*,()\\]/g, '');
      const { data } = await ctx.sb.from('inventory_units').select('id').or(`serial_number.eq.${ref},internal_asset_code.eq.${ref}`).limit(2);
      if (!data || data.length !== 1) throw new AppError('validation', 'Unit tidak ditemukan. Periksa nomor seri / kode unit.');
      unitId = data[0].id;
    }
    if (v.sale_ref) {
      const { data } = await ctx.sb.from('sales').select('id').eq('invoice_no', v.sale_ref.trim()).maybeSingle();
      if (!data) throw new AppError('validation', 'Nomor transaksi tidak ditemukan.');
      saleId = data.id;
    } else if (unitId) {
      const { data } = await ctx.sb.from('sale_items').select('sale_id').eq('unit_id', unitId).eq('active', true).limit(1).maybeSingle();
      saleId = data?.sale_id ?? null;
    }
    const id = await mutate<string>('create_ticket', () => ctx.sb.rpc('create_ticket', {
      p_branch: v.branch_id, p_customer: { name: v.customer_name, phone: v.customer_phone, address: v.customer_address }, p_unit: unitId, p_sale: saleId,
      p_category: v.category, p_desc: v.description, p_eta: v.eta ?? null, p_assigned: v.assigned_to ?? null }));
    revalidatePath('/service');
    redirect(`/service/${id}`);
  });
}

export async function updateTicketAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('service.write');
    const v = parse(z.object({ id: uuid, status: STATUS.optional(), note: z.string().max(1000).optional(), kind: z.enum(['status', 'tindakan', 'komunikasi', 'catatan']).optional(), assigned_to: z.string().uuid().optional(), eta: z.string().optional(), resolution: z.string().max(1000).optional(), tech_notes: z.string().max(2000).optional() }), fd);
    await mutate('update_ticket', () => ctx.sb.rpc('update_ticket', { p_ticket: v.id, p_status: v.status ?? null, p_note: v.note ?? null, p_kind: v.kind === 'status' ? 'catatan' : v.kind ?? 'catatan', p_assigned: v.assigned_to ?? null, p_eta: v.eta ?? null, p_resolution: v.resolution ?? null, p_tech_notes: v.tech_notes ?? null }));
    revalidatePath(`/service/${v.id}`); revalidatePath('/service');
    return { ok: true, message: 'Tiket diperbarui.' };
  });
}
