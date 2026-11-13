import Link from 'next/link';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { Card, DemoTag, Field, PageHeader } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { resetDemoAction, saveSettingsAction, updateBranchAction } from './actions';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function SettingsPage() {
  const ctx = await requirePage('settings.manage');
  const sb = ctx.sb;
  const [branches, settings] = await Promise.all([
    run<Row[]>('cabang', () => sb.from('branches').select('id,code,name,city,active,is_demo').order('is_demo').order('name')),
    run<Row[]>('setting', () => sb.from('app_settings').select('key,value')),
  ]);
  const st = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  return (
    <>
      <PageHeader title="Pengaturan" sub="Hanya Super Admin. Pengguna dan riwayat aktivitas kini punya menu sendiri." actions={<><Link className="btn-ghost" href="/users">User Management</Link><Link className="btn-ghost" href="/activity">Activity Log</Link></>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pengaturan umum">
          <ActionForm action={saveSettingsAction} className="space-y-3">
            <Field label="Nama usaha"><input className="input" name="company_name" defaultValue={st.company_name ?? 'Adrian Laptop Store'} required /></Field>
            <Field label="Batas diskon untuk Sales (%)" hint="0 = hanya Admin yang boleh memberi diskon."><input className="input" type="number" step="0.5" min={0} max={100} name="max_discount_percent" defaultValue={st.max_discount_percent ?? 0} /></Field>
            <Field label="Masa garansi toko default (bulan)" hint="Kosong = belum ditetapkan; garansi tidak dibuat otomatis dan ditampilkan “belum diverifikasi”."><input className="input" type="number" min={0} max={120} name="store_warranty_months" defaultValue={st.store_warranty_months ?? ''} /></Field>
            <Field label="Alamat toko (untuk struk & faktur)"><input className="input" name="company_address" defaultValue={st.company_address ?? ''} /></Field>
            <Field label="Telepon toko"><input className="input" name="company_phone" defaultValue={st.company_phone ?? ''} /></Field>
            <Field label="Teks kaki struk"><input className="input" name="receipt_footer" defaultValue={st.receipt_footer ?? ''} /></Field>
            <Field label="Pajak (%)" hint="0 = pajak tidak dipakai. Jika diisi, otomatis ditambahkan pada setiap transaksi POS."><input className="input" type="number" step="0.5" min={0} max={100} name="tax_percent" defaultValue={st.tax_percent ?? 0} /></Field>
            <Field label="Metode pembayaran (pisahkan dengan koma)" hint="Harus memuat “Tunai”. Metode lain otomatis menjadi pilihan Non-Tunai di POS."><input className="input" name="payment_methods" defaultValue={Array.isArray(st.payment_methods) ? st.payment_methods.join(', ') : ''} required /></Field>
            <SubmitButton>Simpan</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Cabang">
          <div className="space-y-2">{branches.map((b) => (
            <ActionForm key={b.id} action={updateBranchAction} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="id" value={b.id} /><span className="chip">{b.code}</span>
              <input className="input w-40" name="name" defaultValue={b.name} aria-label="Nama" /><input className="input w-36" name="city" defaultValue={b.city ?? ''} aria-label="Kota" />
              <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={b.active} /> aktif</label>{b.is_demo && <DemoTag />}
              <SubmitButton className="btn-ghost py-1">Simpan</SubmitButton>
            </ActionForm>))}</div>
        </Card>
        <Card title="Reset data demo" className="lg:col-span-2">
          <p className="mb-3 text-sm text-ink-500">Menghapus seluruh transaksi, stok, tiket, dan unit pada cabang demo. Data nyata Cidodol tidak disentuh. Untuk mengisi ulang jalankan <code className="chip">supabase/seed/02_demo.sql</code>.</p>
          <ActionForm action={resetDemoAction} className="flex flex-wrap items-center gap-2">
            <input className="input w-48" name="confirm" placeholder="Ketik RESET" required />
            <SubmitButton className="btn-danger" confirm="Hapus SEMUA data demo?">Reset data demo</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
