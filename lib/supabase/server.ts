import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getEnv } from '../env';

const TIMEOUT_MS = 10_000;

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createClient() {
  const { url, anon } = getEnv();
  const store = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list: CookieToSet[]) {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* dipanggil dari Server Component: abaikan, middleware yang menyegarkan sesi */ }
      },
    },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }) },
  });
}
