'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parse, safe, type ActionState } from '@/lib/action';
import { AppError } from '@/lib/errors';

export async function loginAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const v = parse(z.object({ email: z.string().email('Email tidak valid'), password: z.string().min(1, 'Password wajib diisi') }), fd);
    const sb = await createClient();
    const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.password });
    if (error) {
      // Pesan sama untuk semua kegagalan kredensial (tidak membocorkan apakah email terdaftar)
      if (/fetch|network|timeout|abort/i.test(error.message)) throw new AppError('db', 'Tidak dapat terhubung ke layanan login. Coba lagi sebentar.');
      throw new AppError('auth', 'Email atau password salah.');
    }
    redirect('/');
  });
}

export async function logoutAction() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect('/login');
}
