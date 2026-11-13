'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAction } from '@/lib/context';
import { mutate } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { parse, safe, uuid, type ActionState } from '@/lib/action';

const ok = (message: string): ActionState => ({ ok: true, message });

export async function updateBranchAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('settings.manage');
    const v = parse(z.object({ id: uuid, name: z.string().min(2, 'Nama cabang wajib diisi').max(80), city: z.string().max(80).optional(), active: z.string().optional() }), fd);
    await mutate('update branch', () => ctx.sb.from('branches').update({ name: v.name, city: v.city ?? null, active: v.active === 'on' }).eq('id', v.id));
    revalidatePath('/', 'layout');
    return ok('Cabang diperbarui.');
  });
}

export async function saveSettingsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('settings.manage');
    const v = parse(z.object({ max_discount_percent: z.coerce.number().min(0).max(100), store_warranty_months: z.coerce.number().int().min(0).max(120).optional(), payment_methods: z.string().min(2, 'Isi minimal satu metode pembayaran'), company_name: z.string().min(2).max(100), tax_percent: z.coerce.number().min(0).max(100).default(0), company_address: z.string().max(300).optional(), company_phone: z.string().max(40).optional(), receipt_footer: z.string().max(200).optional() }), fd);
    const methods = [...new Set(v.payment_methods.split(',').map((m) => m.trim()).filter(Boolean))];
    if (!methods.length) throw new AppError('validation', 'Isi minimal satu metode pembayaran.');
    const rows = [
      { key: 'max_discount_percent', value: v.max_discount_percent }, { key: 'store_warranty_months', value: v.store_warranty_months ?? null },
      { key: 'payment_methods', value: methods }, { key: 'company_name', value: v.company_name }, { key: 'tax_percent', value: v.tax_percent }, { key: 'company_address', value: v.company_address ?? '' }, { key: 'company_phone', value: v.company_phone ?? '' }, { key: 'receipt_footer', value: v.receipt_footer ?? '' },
    ].map((r) => ({ ...r, updated_by: ctx.user.id, updated_at: new Date().toISOString() }));
    await mutate('settings', () => ctx.sb.from('app_settings').upsert(rows));
    revalidatePath('/settings'); revalidatePath('/pos');
    return ok('Pengaturan disimpan.');
  });
}

export async function resetDemoAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('settings.manage');
    if (fd.get('confirm') !== 'RESET') throw new AppError('validation', 'Ketik RESET untuk mengonfirmasi.');
    await mutate('reset_demo_data', () => ctx.sb.rpc('reset_demo_data'));
    revalidatePath('/', 'layout');
    return ok('Seluruh data demo dihapus. Data nyata (Cidodol) tidak tersentuh.');
  });
}
