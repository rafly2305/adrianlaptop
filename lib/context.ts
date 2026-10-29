import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import { run } from './db';
import { AppError } from './errors';
import { can, type Perm, type Role } from './permissions';

export type Branch = { id: string; code: string; name: string; city: string | null; is_demo: boolean; active: boolean; data_origin: 'real' | 'demo' };
export type Scope = 'real' | 'demo';

const NONE = '00000000-0000-0000-0000-000000000000';

export const getContext = cache(async () => {
  const sb = await createClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const user = data.user;
  const profile = await run<{ id: string; full_name: string; role: Role; active: boolean } | null>('profil', () =>
    sb.from('profiles').select('id,full_name,role,active').eq('id', user.id).maybeSingle());
  const branches = profile?.active
    ? await run<Branch[]>('cabang', () => sb.from('branches').select('id,code,name,city,is_demo,active,data_origin').eq('active', true).order('name'))
    : [];

  const hasReal = branches.some((b) => !b.is_demo);
  const hasDemo = branches.some((b) => b.is_demo);
  const store = await cookies();
  let scope: Scope = store.get('scope')?.value === 'demo' ? 'demo' : 'real';
  if (scope === 'real' && !hasReal && hasDemo) scope = 'demo';
  if (scope === 'demo' && !hasDemo) scope = 'real';
  const scopeLocked = !(hasReal && hasDemo);
  const scopeBranches = branches.filter((b) => b.is_demo === (scope === 'demo'));
  const cb = store.get('branch')?.value;
  const picked = scopeBranches.find((b) => b.id === cb) ?? null;
  const branchIds = picked ? [picked.id] : scopeBranches.length ? scopeBranches.map((b) => b.id) : [NONE];
  return { sb, user, profile, role: (profile?.role ?? null) as Role | null, branches, scope, scopeLocked, scopeBranches, branch: picked, branchIds };
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
