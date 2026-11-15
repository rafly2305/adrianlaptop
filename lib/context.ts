import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import { run } from './db';
import { AppError } from './errors';
import { can, type Perm, type Role } from './permissions';

export type Branch = { id: string; code: string; name: string; city: string | null; is_demo: boolean; active: boolean; data_origin: 'real' | 'demo' };
/** Aplikasi hanya melayani data operasional nyata (Cidodol). Tipe dipertahankan agar kode lama tetap kompatibel. */
export type Scope = 'real';

const NONE = '00000000-0000-0000-0000-000000000000';
/** Kode lokasi operasional tunggal. */
export const LOCATION_CODE = 'CDL';

export const getContext = cache(async () => {
  const sb = await createClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const user = data.user;
  const profile = await run<{ id: string; full_name: string; role: Role; active: boolean } | null>('profil', () =>
    sb.from('profiles').select('id,full_name,role,active').eq('id', user.id).maybeSingle());

  // Hanya cabang nyata (bukan demo). Lokasi aktif selalu Cidodol; tidak ada pilihan lain.
  const real = profile?.active
    ? await run<Branch[]>('lokasi', () => sb.from('branches').select('id,code,name,city,is_demo,active,data_origin').eq('active', true).eq('is_demo', false).eq('data_origin', 'real').order('name'))
    : [];
  const location = real.find((b) => b.code === LOCATION_CODE) ?? real[0] ?? null;
  const branches = location ? [location] : [];
  const branchIds = location ? [location.id] : [NONE];
  const scope: Scope = 'real';
  return { sb, user, profile, role: (profile?.role ?? null) as Role | null, branches, scope, scopeBranches: branches, branch: location, branchIds };
});
export type Ctx = NonNullable<Awaited<ReturnType<typeof getContext>>>;

/** Untuk halaman: wajib login + punya profil aktif + punya izin. */
export async function requirePage(perm: Perm): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx) redirect('/login');
  if (!ctx.profile || !ctx.profile.active) redirect('/login?e=noprofile');
  if (!can(ctx.role, perm)) redirect('/?e=forbidden');
  return ctx;
}

/** Untuk server action / route: lempar AppError bila tidak berhak. */
export async function requireAction(perm: Perm): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx || !ctx.profile?.active) throw new AppError('auth', 'Sesi berakhir. Silakan login kembali.');
  if (!can(ctx.role, perm)) throw new AppError('forbidden', 'Peran Anda tidak diizinkan melakukan tindakan ini.');
  return ctx;
}

export function branchAllowed(ctx: Ctx, id: string): boolean {
  return ctx.branches.some((b) => b.id === id);
}
