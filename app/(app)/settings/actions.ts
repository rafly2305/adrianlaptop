'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAction } from '@/lib/context';
import { mutate } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { parse, safe, type ActionState } from '@/lib/action';
import { uploadProductImage } from '@/lib/product-image';

const ok = (message: string): ActionState => ({ ok: true, message });

async function saveRows(ctx: Awaited<ReturnType<typeof requireAction>>, rows: { key: string; value: unknown }[]) {
  const stamped = rows.map((r) => ({ ...r, updated_by: ctx.user.id, updated_at: new Date().toISOString() }));
  await mutate('settings', () => ctx.sb.from('app_settings').upsert(stamped));
  revalidatePath('/settings'); revalidatePath('/pos');
}

export async function saveSettingsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('settings.manage');
    const v = parse(z.object({
      max_discount_percent: z.coerce.number().min(0, 'Batas diskon tidak boleh negatif').max(100, 'Batas diskon maksimal 100%'),
      store_warranty_months: z.coerce.number().int().min(0).max(120).optional(),
      company_name: z.string().min(2, 'Nama usaha wajib diisi').max(100),
      tax_percent: z.coerce.number().min(0, 'Pajak tidak boleh negatif').max(100, 'Pajak maksimal 100%').default(0),
      company_address: z.string().max(300).optional(), company_phone: z.string().max(40).optional(), receipt_footer: z.string().max(200).optional(),
    }), fd);
    await saveRows(ctx, [
      { key: 'max_discount_percent', value: v.max_discount_percent }, { key: 'store_warranty_months', value: v.store_warranty_months ?? null },
      { key: 'company_name', value: v.company_name }, { key: 'tax_percent', value: v.tax_percent },
      { key: 'company_address', value: v.company_address ?? '' }, { key: 'company_phone', value: v.company_phone ?? '' }, { key: 'receipt_footer', value: v.receipt_footer ?? '' },
    ]);
    return ok('Pengaturan disimpan.');
  });
}

export async function saveQrisAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('settings.manage');
    const v = parse(z.object({ qris_merchant_name: z.string().max(100).optional(), remove: z.string().optional() }), fd);
    const rows: { key: string; value: unknown }[] = [{ key: 'qris_merchant_name', value: v.qris_merchant_name ?? '' }];
    const img = fd.get('qris_image');
    if (v.remove === 'on') rows.push({ key: 'qris_image_url', value: '' });
    else if (img instanceof File && img.size > 0) rows.push({ key: 'qris_image_url', value: await uploadProductImage(img, 'qris') });
    await saveRows(ctx, rows);
    return ok('Pengaturan QRIS disimpan.');
  });
}

export async function saveBanksAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('settings.manage');
    const list: { bank: string; number: string; holder: string }[] = [];
    for (let i = 1; i <= 3; i++) {
      const bank = String(fd.get(`bank_${i}`) ?? '').trim(), number = String(fd.get(`number_${i}`) ?? '').trim(), holder = String(fd.get(`holder_${i}`) ?? '').trim();
      if (!bank && !number && !holder) continue;
      if (!bank || !number || !holder) throw new AppError('validation', `Rekening ${i}: nama bank, nomor rekening, dan nama pemilik wajib diisi lengkap.`);
      if (bank.length > 60 || holder.length > 100) throw new AppError('validation', `Rekening ${i}: teks terlalu panjang.`);
      if (!/^[0-9 .-]{5,30}$/.test(number)) throw new AppError('validation', `Rekening ${i}: nomor rekening hanya boleh angka (5–30 karakter).`);
      list.push({ bank, number, holder });
    }
    await saveRows(ctx, [{ key: 'bank_accounts', value: list }]);
    return ok(list.length ? 'Rekening tujuan transfer disimpan.' : 'Semua rekening dihapus. Transfer Bank tidak dapat dipakai di POS sampai rekening diisi.');
  });
}
