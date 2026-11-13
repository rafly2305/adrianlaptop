import { z } from 'zod';
import { AppError } from './errors';

const schema = z.object({
  url: z.string().url(),
  anon: z.string().min(20),
});

/** Validasi saat runtime. Gagal => pesan jelas, tanpa membocorkan nilai. */
export function getEnv() {
  const r = schema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!r.success) {
    throw new AppError('config', 'Konfigurasi server belum lengkap (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). Hubungi admin.');
  }
  return r.data;
}

export function getServiceKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k || k.length < 20) throw new AppError('config', 'SUPABASE_SERVICE_ROLE_KEY belum diatur di server.');
  return k;
}
