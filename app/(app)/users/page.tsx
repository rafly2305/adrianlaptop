import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { ROLE_LABEL } from '@/lib/permissions';
import { fdatetime, safeLike } from '@/lib/format';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge, Empty, Field, PageHeader, one } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { createUserAction, resetPasswordAction, setUserActiveAction, updateUserAction } from './actions';

type U = { id: string; full_name: string; role: keyof typeof ROLE_LABEL; active: boolean };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage('users.manage');
  const sp = await searchParams;
  const q = safeLike(one(sp.q) ?? '').toLowerCase(), roleF = one(sp.role) ?? '', statusF = one(sp.status) ?? '';
  const [users] = await Promise.all([
    run<U[]>('pengguna', () => ctx.sb.from('profiles').select('id,full_name,role,active').order('full_name')),
  ]);
  // Email & terakhir login berasal dari Supabase Auth (hanya server, via service-role).
  const auth = new Map<string, { email: string; last: string | null }>();
  try {
    const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
    data?.users.forEach((u) => auth.set(u.id, { email: u.email ?? '', last: u.last_sign_in_at ?? null }));
  } catch { /* email/terakhir login tampil '-' bila gagal */ }

  const roleOpts = Object.entries(ROLE_LABEL);
  const list = users.filter((u) => {
    const em = auth.get(u.id)?.email ?? '';
    if (q && !(u.full_name.toLowerCase().includes(q) || em.toLowerCase().includes(q))) return false;
    if (roleF && u.role !== roleF) return false;
    if (statusF === 'aktif' && !u.active) return false;
    if (statusF === 'nonaktif' && u.active) return false;
    return true;
  });

  return (
    <>
      <PageHeader title="User Management" sub="Kelola akun dan peran pengguna. Hanya Super Admin." />

      <details className="card mb-4">
        <summary className="cursor-pointer px-4 py-3 font-semibold">+ Tambah pengguna baru</summary>
        <div className="border-t border-ink-300/40 p-4">
          <ActionForm action={createUserAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <Field label="Email"><input className="input" type="email" name="email" required autoComplete="off" /></Field>
            <Field label="Nama lengkap"><input className="input" name="full_name" required /></Field>
            <Field label="Peran"><select className="input" name="role" defaultValue="sales">{roleOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Password awal (min. 12 karakter)" hint="Buat unik & acak."><input className="input" type="password" name="password" required minLength={12} autoComplete="new-password" /></Field>
            <p className="text-xs text-ink-500 sm:col-span-2">Semua akun otomatis memiliki akses ke lokasi {ctx.branch?.name ?? 'Cidodol'}. Hak fitur ditentukan oleh peran.</p>
            <div className="sm:col-span-2"><SubmitButton>Buat akun</SubmitButton></div>
          </ActionForm>
        </div>
      </details>

      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <input className="input w-56" name="q" defaultValue={q} placeholder="Nama / email" aria-label="Cari" />
        <select className="input w-auto" name="role" defaultValue={roleF} aria-label="Peran"><option value="">Semua peran</option>{roleOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="input w-auto" name="status" defaultValue={statusF} aria-label="Status"><option value="">Semua status</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option></select>
        <button className="btn-primary">Terapkan</button>
      </form>

      {list.length === 0 ? <Empty title="Tidak ada pengguna pada filter ini" /> : (
        <div className="space-y-2">{list.map((u) => {
          const a = auth.get(u.id);
          return (
            <details key={u.id} className="card">
              <summary className="grid cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm sm:grid-cols-[2fr_1.2fr_1.5fr_auto_1.2fr]">
                <div><div className="font-medium">{u.full_name}</div><div className="text-xs text-ink-500">{a?.email || '-'}</div></div>
                <div>{ROLE_LABEL[u.role]}</div>
                <div className="text-ink-500">{ctx.branch?.name ?? 'Cidodol'}</div>
                <div><Badge tone={u.active ? 'ok' : 'bad'}>{u.active ? 'Aktif' : 'Nonaktif'}</Badge></div>
                <div className="text-xs text-ink-500">Login terakhir: {a?.last ? fdatetime(a.last) : 'belum pernah'}</div>
              </summary>
              <div className="space-y-4 border-t border-ink-300/40 p-4">
                <ActionForm action={updateUserAction} className="space-y-3">
                  <input type="hidden" name="id" value={u.id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Nama"><input className="input" name="full_name" defaultValue={u.full_name} required /></Field>
                    <Field label="Email"><input className="input" type="email" name="email" defaultValue={a?.email ?? ''} /></Field>
                    <Field label="Peran"><select className="input" name="role" defaultValue={u.role}>{roleOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                  </div>
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" defaultChecked={u.active} /> Akun aktif</label>
                  <SubmitButton>Simpan perubahan</SubmitButton>
                </ActionForm>
                <div className="flex flex-wrap items-end gap-4 border-t border-ink-300/40 pt-4">
                  <ActionForm action={resetPasswordAction} resetOnSuccess className="flex flex-wrap items-center gap-2 text-sm">
                    <input type="hidden" name="id" value={u.id} /><input type="hidden" name="name" value={u.full_name} />
                    <input className="input w-64" type="password" name="password" placeholder="Password baru (min. 12)" minLength={12} autoComplete="new-password" aria-label="Password baru" required />
                    <SubmitButton className="btn-ghost py-1" confirm="Atur ulang password pengguna ini?">Atur ulang password</SubmitButton>
                  </ActionForm>
                  <ActionForm action={setUserActiveAction}>
                    <input type="hidden" name="id" value={u.id} /><input type="hidden" name="name" value={u.full_name} />
                    <input type="hidden" name="active" value={u.active ? 'false' : 'true'} />
                    {u.active
                      ? <SubmitButton className="btn-danger py-1" confirm="Nonaktifkan akun ini? Pengguna tidak dapat masuk lagi.">Nonaktifkan akun</SubmitButton>
                      : <SubmitButton className="btn-primary py-1">Aktifkan kembali</SubmitButton>}
                  </ActionForm>
                </div>
              </div>
            </details>
          );
        })}</div>
      )}
    </>
  );
}
