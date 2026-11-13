'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAction } from '@/lib/context';
import { mutate } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { logActivity } from '@/lib/activity';
import { createAdminClient } from '@/lib/supabase/admin';
import { parse, safe, uuid, type ActionState } from '@/lib/action';

const ROLE = z.enum(['super_admin', 'branch_admin', 'inventory_staff', 'sales', 'service_staff', 'finance', 'hr']);
const ok = (message: string): ActionState => ({ ok: true, message });

export async function createUserAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('users.manage');
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
    await logActivity({ actorId: ctx.user.id, action: 'user.create', entity: 'users', entityId: uid, detail: { email: v.email, name: v.full_name, role: v.role } });
    revalidatePath('/users');
    return ok('Akun dibuat. Sampaikan password awal lewat saluran aman dan minta pengguna menggantinya.');
  });
}

export async function updateUserAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('users.manage');
    const v = parse(z.object({ id: uuid, full_name: z.string().min(2).max(100), role: ROLE, email: z.string().email('Email tidak valid').optional(), active: z.string().optional() }), fd);
    const active = v.active === 'on';
    if (v.id === ctx.user.id && (!active || v.role !== 'super_admin')) throw new AppError('validation', 'Anda tidak dapat menonaktifkan atau menurunkan peran akun Anda sendiri.');
    const branchIds = fd.getAll('branches').map(String);
    if (v.role !== 'super_admin' && branchIds.length === 0) throw new AppError('validation', 'Pilih minimal satu cabang untuk peran ini.');
    if (v.email) {
      const { error } = await createAdminClient().auth.admin.updateUserById(v.id, { email: v.email, email_confirm: true });
      if (error) throw new AppError('validation', error.message.includes('already') ? 'Email sudah dipakai akun lain.' : 'Gagal mengubah email.', error);
    }
    await mutate('update profile', () => ctx.sb.from('profiles').update({ full_name: v.full_name, role: v.role, active }).eq('id', v.id));
    await mutate('clear access', () => ctx.sb.from('user_branch_access').delete().eq('user_id', v.id));
    if (branchIds.length) await mutate('set access', () => ctx.sb.from('user_branch_access').insert(branchIds.map((b) => ({ user_id: v.id, branch_id: b }))));
    await logActivity({ actorId: ctx.user.id, action: 'user.update', entity: 'users', entityId: v.id, detail: { name: v.full_name, role: v.role, email: v.email } });
    revalidatePath('/users');
    return ok('Akun diperbarui.');
  });
}

/** Nonaktifkan / aktifkan kembali akun (riwayat transaksi pengguna tetap utuh, jadi tidak dihapus permanen). */
export async function setUserActiveAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('users.manage');
    const v = parse(z.object({ id: uuid, active: z.enum(['true', 'false']), name: z.string().optional() }), fd);
    const active = v.active === 'true';
    if (v.id === ctx.user.id && !active) throw new AppError('validation', 'Anda tidak dapat menonaktifkan akun Anda sendiri.');
    await mutate('set active', () => ctx.sb.from('profiles').update({ active }).eq('id', v.id));
    await logActivity({ actorId: ctx.user.id, action: active ? 'user.activate' : 'user.deactivate', entity: 'users', entityId: v.id, detail: { name: v.name } });
    revalidatePath('/users');
    return ok(active ? 'Akun diaktifkan kembali.' : 'Akun dinonaktifkan. Pengguna tidak dapat masuk lagi.');
  });
}

export async function resetPasswordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('users.manage');
    const v = parse(z.object({ id: uuid, name: z.string().optional(), password: z.string().min(12, 'Password minimal 12 karakter').max(72) }), fd);
    const { error } = await createAdminClient().auth.admin.updateUserById(v.id, { password: v.password });
    if (error) throw new AppError('db', 'Gagal mengatur ulang password.', error);
    await logActivity({ actorId: ctx.user.id, action: 'user.reset_password', entity: 'users', entityId: v.id, detail: { name: v.name } });
    return ok('Password diatur ulang. Sampaikan lewat saluran aman.');
  });
}
