import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getEnv, getServiceKey } from '../env';

/** Klien service-role. HANYA untuk server (membuat akun). Tidak pernah dikirim ke browser. */
export function createAdminClient() {
  const { url } = getEnv();
  return createClient(url, getServiceKey(), { auth: { autoRefreshToken: false, persistSession: false } });
}
