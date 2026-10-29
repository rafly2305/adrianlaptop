import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/** Health check publik: hanya status, tanpa detail/rahasia. */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ status: 'error', config: 'incomplete' }, { status: 503 });
  const t0 = Date.now();
  try {
    const sb = createClient(url, anon, { global: { fetch: (i, init) => fetch(i, { ...init, signal: AbortSignal.timeout(5000) }) } });
    // Cek koneksi ke API/Auth tanpa membaca data (tidak butuh login).
    const { error } = await sb.auth.getSession();
    if (error) throw error;
    const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon }, signal: AbortSignal.timeout(5000) });
    return NextResponse.json({ status: r.ok ? 'ok' : 'degraded', supabase: r.ok ? 'reachable' : 'unreachable', ms: Date.now() - t0 }, { status: r.ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ status: 'error', supabase: 'unreachable', ms: Date.now() - t0 }, { status: 503 });
  }
}
