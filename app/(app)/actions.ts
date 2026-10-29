'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getContext } from '@/lib/context';

export async function setScopeAction(fd: FormData) {
  const ctx = await getContext();
  if (!ctx) return;
  const scope = fd.get('scope') === 'demo' ? 'demo' : 'real';
  const branch = String(fd.get('branch') ?? 'all');
  const valid = ctx.branches.some((b) => b.id === branch && b.is_demo === (scope === 'demo')) ? branch : 'all';
  const store = await cookies();
  const opts = { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30 };
  store.set('scope', scope, opts);
  store.set('branch', valid, opts);
  revalidatePath('/', 'layout');
}
