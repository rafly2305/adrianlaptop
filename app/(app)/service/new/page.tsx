import Link from 'next/link';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { TICKET_CATEGORIES } from '@/lib/labels';
import { Card, Field, PageHeader, one } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { createTicketAction } from '../actions';

export default async function NewTicket({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage('service.create');
  const sp = await searchParams;
  const staff = await run<{ id: string; full_name: string }[]>('petugas', () => ctx.sb.from('profiles').select('id,full_name').in('role', ['service_staff', 'branch_admin']).eq('active', true).order('full_name'));
  return (
    <>
      <PageHeader title="Tiket layanan baru" actions={<Link className="btn-ghost" href="/service">Kembali</Link>} />
      <Card className="max-w-3xl">
        <ActionForm action={createTicketAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Cabang"><select className="input" name="branch_id" required defaultValue={ctx.branch?.id ?? ctx.scopeBranches[0]?.id}>{ctx.scopeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Jenis keluhan"><select className="input" name="category" required defaultValue=""><option value="" disabled>Pilih…</option>{TICKET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Nomor seri / kode unit" hint="Opsional, tetapi menghubungkan tiket ke riwayat unit & garansi."><input className="input font-mono" name="unit_ref" defaultValue={one(sp.unit)} /></Field>
          <Field label="Nomor transaksi (invoice)" hint="Opsional; otomatis terisi bila unit pernah dijual."><input className="input font-mono" name="sale_ref" /></Field>
          <Field label="Nama pelanggan"><input className="input" name="customer_name" /></Field>
          <Field label="Telepon"><input className="input" name="customer_phone" inputMode="tel" /></Field>
          <Field label="Alamat" className="sm:col-span-2"><input className="input" name="customer_address" /></Field>
          <Field label="Deskripsi masalah" className="sm:col-span-2"><textarea className="input" name="description" rows={4} required minLength={3} /></Field>
          <Field label="Estimasi selesai"><input className="input" type="date" name="eta" /></Field>
          <Field label="Penanggung jawab"><select className="input" name="assigned_to" defaultValue=""><option value="">Belum ditentukan</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></Field>
          <div className="sm:col-span-2"><SubmitButton>Buat tiket</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
