import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { can } from '@/lib/permissions';
import { TICKET_STATUS, WARRANTY_STATE } from '@/lib/labels';
import { fdate, fdatetime } from '@/lib/format';
import { Card, Chip, DemoTag, Field, PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { PrintButton } from '@/components/PrintButton';
import { updateTicketAction } from '../actions';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function TicketDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requirePage('service.view');
  const sb = ctx.sb;
  const t = await run<Row | null>('tiket', () => sb.from('service_tickets').select('*, customers(name,phone,address), branches(name,is_demo), inventory_units(id,internal_asset_code,serial_number,serial_status,products(name)), sales(id,invoice_no), assignee:profiles!assigned_to(full_name)').eq('id', id).maybeSingle());
  if (!t) notFound();
  const [hist, staff] = await Promise.all([
    run<Row[]>('riwayat tiket', () => sb.from('service_ticket_history').select('id,kind,status,note,created_at,profiles(full_name)').eq('ticket_id', id).order('created_at', { ascending: false })),
    run<{ id: string; full_name: string }[]>('petugas', () => sb.from('profiles').select('id,full_name').in('role', ['service_staff', 'branch_admin']).eq('active', true).order('full_name')),
  ]);
  const write = can(ctx.role, 'service.write');
  return (
    <>
      <PageHeader title={`Tiket ${t.ticket_no}`} sub={<span className="flex flex-wrap items-center gap-2"><StatusBadge map={TICKET_STATUS} value={t.status} /><StatusBadge map={WARRANTY_STATE} value={t.warranty_state} />{t.branches?.is_demo && <DemoTag />}</span>}
        actions={<><PrintButton label="Cetak" /><Link className="btn-ghost no-print" href="/service">Kembali</Link></>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Rincian" className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-500">Cabang</dt><dd>{t.branches?.name}</dd></div>
            <div><dt className="text-ink-500">Tanggal masuk / estimasi</dt><dd>{fdate(t.received_at)} / {t.eta ? fdate(t.eta) : '-'}</dd></div>
            <div><dt className="text-ink-500">Pelanggan</dt><dd>{t.customers?.name ?? '-'} {t.customers?.phone ?? ''}</dd></div>
            <div><dt className="text-ink-500">Penanggung jawab</dt><dd>{t.assignee?.full_name ?? 'belum ditentukan'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-ink-500">Unit</dt><dd>{t.inventory_units ? <Link className="text-brand underline" href={`/inventory/units/${t.inventory_units.id}`}>{t.inventory_units.products?.name} <Chip>{t.inventory_units.internal_asset_code}</Chip>{t.inventory_units.serial_number && <> <Chip>SN {t.inventory_units.serial_number}</Chip></>}</Link> : 'tidak terkait unit'}</dd></div>
            {t.sales && <div><dt className="text-ink-500">Transaksi</dt><dd><Link className="text-brand underline" href={`/sales/${t.sales.id}`}>{t.sales.invoice_no}</Link></dd></div>}
            <div className="sm:col-span-2"><dt className="text-ink-500">Kategori & deskripsi</dt><dd><b>{t.category}</b> — {t.description}</dd></div>
            {t.technician_notes && <div className="sm:col-span-2"><dt className="text-ink-500">Catatan teknisi</dt><dd>{t.technician_notes}</dd></div>}
            {t.resolution && <div className="sm:col-span-2"><dt className="text-ink-500">Penyelesaian</dt><dd>{t.resolution}</dd></div>}
          </dl>
          <p className="mt-3 text-xs text-ink-500">Status garansi dihitung saat tiket dibuat dari data garansi unit. “Belum diverifikasi” berarti masa garansi belum dipastikan.</p>
        </Card>
        {write && (
          <Card title="Perbarui tiket">
            <ActionForm action={updateTicketAction} className="space-y-3">
              <input type="hidden" name="id" value={t.id} />
              <Field label="Status"><select className="input" name="status" defaultValue={t.status}>{Object.entries(TICKET_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Penanggung jawab"><select className="input" name="assigned_to" defaultValue={t.assigned_to ?? ''}><option value="">(tidak diubah)</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></Field>
              <Field label="Estimasi selesai"><input className="input" type="date" name="eta" defaultValue={t.eta ?? ''} /></Field>
              <Field label="Jenis catatan"><select className="input" name="kind" defaultValue="tindakan"><option value="tindakan">Tindakan</option><option value="komunikasi">Komunikasi pelanggan</option><option value="catatan">Catatan</option></select></Field>
              <Field label="Catatan / pembaruan"><textarea className="input" name="note" rows={2} /></Field>
              <Field label="Catatan teknisi"><textarea className="input" name="tech_notes" rows={2} defaultValue={t.technician_notes ?? ''} /></Field>
              <Field label="Penyelesaian" hint="Wajib saat status Selesai/Ditolak."><textarea className="input" name="resolution" rows={2} defaultValue={t.resolution ?? ''} /></Field>
              <SubmitButton>Simpan</SubmitButton>
            </ActionForm>
          </Card>)}
        <Card title="Riwayat tindakan & komunikasi" className="lg:col-span-3">
          <ol className="space-y-3 text-sm">{hist.map((h) => (<li key={h.id} className="border-l-2 border-brand pl-3"><div className="flex flex-wrap items-center gap-2"><span className="text-ink-500">{fdatetime(h.created_at)}</span><span>{h.profiles?.full_name ?? 'sistem'}</span>{h.status && <StatusBadge map={TICKET_STATUS} value={h.status} />}<span className="text-xs text-ink-500">{h.kind}</span></div>{h.note && <div>{h.note}</div>}</li>))}</ol>
        </Card>
      </div>
    </>
  );
}
