// Membuat Super Admin PERTAMA. Jalankan lokal (bukan di Vercel):
//   BOOTSTRAP_EMAIL=... BOOTSTRAP_PASSWORD=... BOOTSTRAP_NAME="Nama" \
//   node --env-file=.env.local scripts/bootstrap-admin.mjs
// Password hanya dari environment shell Anda; tidak disimpan di kode/repo. Minimal 12 karakter.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.BOOTSTRAP_EMAIL;
const password = process.env.BOOTSTRAP_PASSWORD;
const name = process.env.BOOTSTRAP_NAME || 'Super Admin';

if (!url || !key || !email || !password) { console.error('Lengkapi NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD.'); process.exit(1); }
if (password.length < 12) { console.error('Password minimal 12 karakter.'); process.exit(1); }

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: existing } = await sb.from('profiles').select('id').eq('role', 'super_admin').limit(1);
if (existing?.length && process.env.ALLOW_ANOTHER !== '1') { console.error('Super Admin sudah ada. Buat akun lain lewat menu Pengaturan (atau set ALLOW_ANOTHER=1).'); process.exit(1); }

const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (error) { console.error('Gagal membuat user auth:', error.message); process.exit(1); }
const { data: cdl } = await sb.from('branches').select('id').eq('code', 'CDL').maybeSingle();
const { error: pe } = await sb.from('profiles').insert({ id: data.user.id, full_name: name, role: 'super_admin', default_branch_id: cdl?.id ?? null });
if (pe) { await sb.auth.admin.deleteUser(data.user.id); console.error('Gagal membuat profil; akun dibatalkan:', pe.message); process.exit(1); }
console.log(`Super Admin dibuat: ${email}. Login lalu ganti password bila perlu.`);
