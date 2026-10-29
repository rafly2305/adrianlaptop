'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAction } from '@/lib/context';
import { mutate } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { parse, safe, uuid, type ActionState } from '@/lib/action';

const ROLE = z.enum(['super_admin', 'branch_admin', 'inventory_staff', 'sales', 'service_staff', 'finance', 'hr']);
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
    const v = parse(z.object({ max_discount_percent: z.coerce.number().min(0).max(100), store_warranty_months: z.coerce.number().int().min(0).max(120).optional(), payment_methods: z.string().min(2, 'Isi minimal satu metode pembayaran'), company_name: z.string().min(2).max(100) }), fd);
    const methods = [...new Set(v.payment_methods.split(',').map((m) => m.trim()).filter(Boolean))];
    if (!methods.length) throw new AppError('validation', 'Isi minimal satu metode pembayaran.');
    const rows = [
      { key: 'max_discount_percent', value: v.max_discount_percent }, { key: 'store_warranty_months', value: v.store_warranty_months ?? null },
      { key: 'payment_methods', value: methods }, { key: 'company_name', value: v.company_name },
    ].map((r) => ({ ...r, updated_by: ctx.user.id, updated_at: new Date().toISOString() }));
    await mutate('settings', () => ctx.sb.from('app_settings').upsert(rows));
    revalidatePath('/settings'); revalidatePath('/pos');
    return ok('Pengaturan disimpan.');
  });
}

export async function createUserAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('settings.manage');
    const v = parse(z.object({ email: z.string().email('Email tidak valid'), password: z.string().min(12, 'Password minimal 12 karakter').max(72), full_name: z.string().min(2, 'Nama wajib diisi').max(100), role: ROLE }), fd);
    const branchIds = fd.getAll('branches').map(String).filter((b) => ctx.branches.some((x) => x.id === b));
    if (v.role !== 'super_admin' && branchIds.length === 0) throw new AppError('validation', 'Pilih minimal satu cabang untuk peran ini.');
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({ email: v.email, password: v.password, email_confirm: true });
    if (error || !data.user) throw new AppError('validation', error?.message.includes('already') ? 'Email sudah terdaftar.' : 'Gagal membuat akun. Periksa email dan password.');
    const uid = data.user.id;
    const p = await admin.from('profiles').insert({ id: uid, full_name: v.full_name, role: v.role, default_branch_id: branchIds[0] ?? null });
    const a = branchIds.length ? await admin.from('user_branch_access').insert(branchIds.map((b) => ({ user_id: uid, branch_id: b }))) : { error: null };
    if (p.error || a.error) { await admin.auth.admin.deleteUser(uid); throw new AppError('db', 'Gagal menyimpan profil akun; akun dibatalkan.', p.error ?? a.error); }
    revalidatePath('/settings');
    return ok('Akun dibuat. Sampaikan password awal lewat saluran aman dan minta pengguna menggantinya.');
  });
}

export async function updateUserAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('settings.manage');
    const v = parse(z.object({ id: uuid, full_name: z.string().min(2).max(100), role: ROLE, active: z.string().optional() }), fd);
    const active = v.active === 'on';
    if (v.id === ctx.user.id && (!active || v.role !== 'super_admin')) throw new AppError('validation', 'Anda tidak dapat menonaktifkan atau menurunkan peran akun Anda sendiri.');
    const branchIds = fd.getAll('branches').map(String);
    if (v.role !== 'super_admin' && branchIds.length === 0) throw new AppError('validation', 'Pilih minimal satu cabang untuk peran ini.');
    await mutate('update profile', () => ctx.sb.from('profiles').update({ full_name: v.full_name, role: v.role, active }).eq('id', v.id));
    await mutate('clear access', () => ctx.sb.from('user_branch_access').delete().eq('user_id', v.id));
    if (branchIds.length) await mutate('set access', () => ctx.sb.from('user_branch_access').insert(branchIds.map((b) => ({ user_id: v.id, branch_id: b }))));
    revalidatePath('/settings');
    return ok('Akun diperbarui.');
  });
}

export async function resetPasswordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    await requireAction('settings.manage');
    const v = parse(z.object({ id: uuid, password: z.string().min(12, 'Password minimal 12 karakter').max(72) }), fd);
    const { error } = await createAdminClient().auth.admin.updateUserById(v.id, { password: v.password });
    if (error) throw new AppError('db', 'Gagal mengatur ulang password.', error);
    return ok('Password diatur ulang. Sampaikan lewat saluran aman.');
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
