import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { ROLE_LABEL } from '@/lib/permissions';
import { fdatetime } from '@/lib/format';
import { Card, DemoTag, Field, PageHeader } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { createUserAction, resetDemoAction, resetPasswordAction, saveSettingsAction, updateBranchAction, updateUserAction } from './actions';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function SettingsPage() {
  const ctx = await requirePage('settings.manage');
  const sb = ctx.sb;
  const [branches, settings, users, access, audits] = await Promise.all([
    run<Row[]>('cabang', () => sb.from('branches').select('id,code,name,city,active,is_demo').order('is_demo').order('name')),
    run<Row[]>('setting', () => sb.from('app_settings').select('key,value')),
    run<Row[]>('pengguna', () => sb.from('profiles').select('id,full_name,role,active').order('full_name')),
    run<Row[]>('akses', () => sb.from('user_branch_access').select('user_id,branch_id')),
    run<Row[]>('audit', () => sb.from('audit_logs').select('id,at,action,entity,detail,profiles:actor_id(full_name)').order('at', { ascending: false }).limit(40)),
  ]);
  const st = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const acc = new Map<string, Set<string>>();
  access.forEach((a) => { if (!acc.has(a.user_id)) acc.set(a.user_id, new Set()); acc.get(a.user_id)!.add(a.branch_id); });
  const roleOpts = Object.entries(ROLE_LABEL);
  const BranchChecks = ({ sel }: { sel?: Set<string> }) => (<div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">{branches.map((b) => <label key={b.id} className="flex items-center gap-1"><input type="checkbox" name="branches" value={b.id} defaultChecked={sel?.has(b.id)} />{b.name}{b.is_demo ? ' (Demo)' : ''}</label>)}</div>);

  return (
    <>
      <PageHeader title="Pengaturan" sub="Hanya Super Admin." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pengaturan umum">
          <ActionForm action={saveSettingsAction} className="space-y-3">
            <Field label="Nama usaha"><input className="input" name="company_name" defaultValue={st.company_name ?? 'Adrian Laptop Store'} required /></Field>
            <Field label="Batas diskon untuk Sales (%)" hint="0 = hanya Admin yang boleh memberi diskon."><input className="input" type="number" step="0.5" min={0} max={100} name="max_discount_percent" defaultValue={st.max_discount_percent ?? 0} /></Field>
            <Field label="Masa garansi toko default (bulan)" hint="Kosong = belum ditetapkan; garansi tidak dibuat otomatis dan ditampilkan “belum diverifikasi”."><input className="input" type="number" min={0} max={120} name="store_warranty_months" defaultValue={st.store_warranty_months ?? ''} /></Field>
            <Field label="Metode pembayaran (pisahkan dengan koma)"><input className="input" name="payment_methods" defaultValue={Array.isArray(st.payment_methods) ? st.payment_methods.join(', ') : ''} required /></Field>
            <SubmitButton>Simpan</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Cabang (nama sementara dapat diedit)">
          <div className="space-y-2">{branches.map((b) => (
            <ActionForm key={b.id} action={updateBranchAction} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="id" value={b.id} /><span className="chip">{b.code}</span>
              <input className="input w-40" name="name" defaultValue={b.name} aria-label="Nama" /><input className="input w-36" name="city" defaultValue={b.city ?? ''} aria-label="Kota" />
              <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={b.active} /> aktif</label>{b.is_demo && <DemoTag />}
              <SubmitButton className="btn-ghost py-1">Simpan</SubmitButton>
            </ActionForm>))}</div>
        </Card>

        <Card title="Buat akun pengguna" className="lg:col-span-2">
          <ActionForm action={createUserAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <Field label="Email"><input className="input" type="email" name="email" required autoComplete="off" /></Field>
            <Field label="Nama lengkap"><input className="input" name="full_name" required /></Field>
            <Field label="Peran"><select className="input" name="role" defaultValue="sales">{roleOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Password awal (min. 12 karakter)" hint="Buat unik & acak. Jangan memakai kata yang mudah ditebak."><input className="input" type="password" name="password" required minLength={12} autoComplete="new-password" /></Field>
            <div className="sm:col-span-2"><div className="label">Akses cabang</div><BranchChecks /><p className="mt-1 text-xs text-ink-500">Akun demo: centang hanya cabang bertanda (Demo). Super Admin otomatis dapat melihat semua cabang.</p></div>
            <div className="sm:col-span-2"><SubmitButton>Buat akun</SubmitButton></div>
          </ActionForm>
        </Card>

        <Card title="Pengguna & akses" className="lg:col-span-2">
          <div className="space-y-4">{users.map((u) => (
            <div key={u.id} className="rounded border border-ink-300/50 p-3">
              <ActionForm action={updateUserAction} className="space-y-2">
                <input type="hidden" name="id" value={u.id} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <input className="input w-48" name="full_name" defaultValue={u.full_name} aria-label="Nama" />
                  <select className="input w-auto" name="role" defaultValue={u.role} aria-label="Peran">{roleOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={u.active} /> aktif</label>
                  <SubmitButton className="btn-ghost py-1">Simpan</SubmitButton>
                </div>
                <BranchChecks sel={acc.get(u.id)} />
              </ActionForm>
              <ActionForm action={resetPasswordAction} resetOnSuccess className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <input type="hidden" name="id" value={u.id} />
                <input className="input w-64" type="password" name="password" placeholder="Password baru (min. 12)" minLength={12} autoComplete="new-password" aria-label="Password baru" required />
                <SubmitButton className="btn-ghost py-1" confirm="Atur ulang password pengguna ini?">Atur ulang password</SubmitButton>
              </ActionForm>
            </div>))}</div>
        </Card>

        <Card title="Reset data demo" className="lg:col-span-2">
          <p className="mb-3 text-sm text-ink-500">Menghapus seluruh transaksi, stok, tiket, dan unit pada cabang demo. Data nyata Cidodol tidak disentuh. Untuk mengisi ulang jalankan <code className="chip">supabase/seed/02_demo.sql</code>.</p>
          <ActionForm action={resetDemoAction} className="flex flex-wrap items-center gap-2">
            <input className="input w-48" name="confirm" placeholder="Ketik RESET" required />
            <SubmitButton className="btn-danger" confirm="Hapus SEMUA data demo?">Reset data demo</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Audit log terbaru" className="lg:col-span-2">
          <ul className="divide-y divide-ink-300/30 text-sm">{audits.map((a) => (<li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span><b>{a.action}</b> {a.entity ? `· ${a.entity}` : ''} <span className="text-xs text-ink-500">{a.detail && Object.keys(a.detail).length ? JSON.stringify(a.detail).slice(0, 120) : ''}</span></span><span className="text-ink-500">{a.profiles?.full_name ?? 'sistem'} · {fdatetime(a.at)}</span></li>))}</ul>
        </Card>
      </div>
    </>
  );
}
