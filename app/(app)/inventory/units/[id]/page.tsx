import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { can } from '@/lib/permissions';
import { CONDITION, MOVEMENT, SALE_STATUS, SERIAL_STATUS, TICKET_STATUS, UNIT_STATUS, WARRANTY_STATE } from '@/lib/labels';
import { fdate, fdatetime, rupiah } from '@/lib/format';
import { Card, Chip, DemoTag, Empty, Field, PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { addInspectionAction, setSerialAction, setUnitStatusAction, updateUnitAction } from '../../actions';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function UnitDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requirePage('inventory.view');
  const sb = ctx.sb;
  const unit = await run<Row | null>('unit', () => sb.from('inventory_units').select('*, products(*, categories(name)), branches(name,code,is_demo)').eq('id', id).maybeSingle());
  if (!unit) notFound();
  const [moves, sales, rets, tickets, wars, insp] = await Promise.all([
    run<Row[]>('gerak unit', () => sb.from('stock_movements').select('type,qty,reason,created_at,branches(name),profiles(full_name)').eq('unit_id', id).order('created_at', { ascending: false })),
    can(ctx.role, 'sales.view') ? run<Row[]>('jual unit', () => sb.from('sale_items').select('id,unit_price,line_total,active,sales(id,invoice_no,sold_at,status,customers(name))').eq('unit_id', id)) : [],
    can(ctx.role, 'sales.view') ? run<Row[]>('retur unit', () => sb.from('returns').select('reason,refund_amount,created_at,sales(invoice_no)').eq('unit_id', id)) : [],
    can(ctx.role, 'service.view') ? run<Row[]>('tiket unit', () => sb.from('service_tickets').select('id,ticket_no,category,status,received_at,warranty_state').eq('unit_id', id).order('received_at', { ascending: false })) : [],
    run<Row[]>('garansi unit', () => sb.from('warranties').select('kind,start_date,end_date,verified,voided').eq('unit_id', id).order('end_date', { ascending: false })),
    run<Row[]>('inspeksi', () => sb.from('unit_inspections').select('id,checked_at,checklist,notes,profiles(full_name)').eq('unit_id', id).order('created_at', { ascending: false })),
  ]);
  const write = can(ctx.role, 'inventory.write');
  const p = unit.products as Row;
  const spec = [p.processor, p.ram_gb ? `${p.ram_gb} GB RAM` : null, p.storage, p.touchscreen === true ? 'Layar sentuh' : null].filter(Boolean).join(' · ');
  const frozen = unit.status === 'sold' || unit.status === 'in_transit';

  return (
    <>
      <PageHeader title={p.name} sub={<span className="flex flex-wrap items-center gap-2"><Chip>{unit.internal_asset_code}</Chip>{unit.serial_number && <Chip>SN {unit.serial_number}</Chip>}<StatusBadge map={UNIT_STATUS} value={unit.status} />{unit.branches?.is_demo && <DemoTag />}</span>}
        actions={<Link href="/inventory" className="btn-ghost">Kembali</Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Informasi unit" className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-500">SKU produk</dt><dd><Link className="text-brand underline" href={`/inventory/products/${p.id}`}>{p.sku}</Link></dd></div>
            <div><dt className="text-ink-500">Merek / model</dt><dd>{[p.brand, p.model].filter(Boolean).join(' ') || '-'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-ink-500">Spesifikasi</dt><dd>{spec || 'tidak diketahui'}{p.needs_verification && <span className="ml-2 text-warn">(perlu verifikasi fisik)</span>}</dd></div>
            <div><dt className="text-ink-500">Cabang</dt><dd>{unit.branches?.name}</dd></div>
            <div><dt className="text-ink-500">Kondisi</dt><dd>{CONDITION[unit.condition]}</dd></div>
            <div><dt className="text-ink-500">Tanggal masuk</dt><dd>{fdate(unit.received_at)}</dd></div>
            <div><dt className="text-ink-500">Harga modal</dt><dd>{unit.cost_price != null ? rupiah(unit.cost_price) : 'belum diisi'}</dd></div>
            <div><dt className="text-ink-500">Garansi toko</dt><dd>{unit.store_warranty_months != null ? `${unit.store_warranty_months} bulan` : 'belum diverifikasi'}</dd></div>
            <div><dt className="text-ink-500">Garansi produsen s/d</dt><dd>{unit.mfr_warranty_until ? fdate(unit.mfr_warranty_until) : 'belum diverifikasi'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-ink-500">Sumber data</dt><dd className="text-xs">Ref. daftar no. {unit.source_ref ?? '-'} · “{unit.source_raw ?? '-'}”</dd></div>
            {unit.notes && <div className="sm:col-span-2"><dt className="text-ink-500">Catatan</dt><dd>{unit.notes}</dd></div>}
          </dl>
        </Card>
        <Card title="Nomor seri pabrikan">
          <p className="mb-2 text-sm"><StatusBadge map={SERIAL_STATUS} value={unit.serial_status} /></p>
          {write && unit.serial_status !== 'sintetis_demo' ? (
            <ActionForm action={setSerialAction} className="space-y-3">
              <input type="hidden" name="unit_id" value={unit.id} />
              <Field label="Nomor seri" hint="Isi hanya dengan nomor seri asli dari perangkat. Kosongkan bila belum diketahui."><input className="input font-mono" name="serial" defaultValue={unit.serial_number ?? ''} maxLength={80} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" defaultChecked={unit.serial_status === 'terverifikasi'} /> Sudah dicocokkan dengan perangkat fisik</label>
              <SubmitButton>Simpan nomor seri</SubmitButton>
            </ActionForm>) : <p className="text-sm text-ink-500">{unit.serial_status === 'sintetis_demo' ? 'Nomor seri sintetis (demo), tidak dapat diubah.' : 'Hanya staf inventory yang dapat mengubah.'}</p>}
        </Card>

        {write && (
          <Card title="Ubah detail" className="lg:col-span-2">
            <ActionForm action={updateUnitAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="unit_id" value={unit.id} />
              <Field label="Kondisi"><select className="input" name="condition" defaultValue={unit.condition}>{Object.entries(CONDITION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Harga modal (Rp)"><input className="input" type="number" min={0} name="cost" defaultValue={unit.cost_price ?? ''} /></Field>
              <Field label="Garansi toko (bulan)"><input className="input" type="number" min={0} max={120} name="store_warranty_months" defaultValue={unit.store_warranty_months ?? ''} /></Field>
              <Field label="Garansi produsen s/d"><input className="input" type="date" name="mfr_until" defaultValue={unit.mfr_warranty_until ?? ''} /></Field>
              <Field label="Catatan" className="sm:col-span-2"><textarea className="input" rows={2} name="notes" defaultValue={unit.notes ?? ''} /></Field>
              <Field label="Catatan pemeriksaan" className="sm:col-span-2"><textarea className="input" rows={2} name="inspection_notes" defaultValue={unit.inspection_notes ?? ''} /></Field>
              <div className="sm:col-span-2"><SubmitButton>Simpan</SubmitButton></div>
            </ActionForm>
          </Card>)}
        {write && (
          <Card title="Ubah status">
            {frozen ? <p className="text-sm text-ink-500">Status “{UNIT_STATUS[unit.status][0]}” hanya berubah lewat penjualan/retur atau transfer.</p> : (
              <ActionForm action={setUnitStatusAction} className="space-y-3">
                <input type="hidden" name="unit_id" value={unit.id} />
                <Field label="Status baru"><select className="input" name="status" defaultValue={unit.status}>{['available', 'reserved', 'damaged', 'returned', 'in_warranty', 'archived'].map((s) => <option key={s} value={s}>{UNIT_STATUS[s][0]}</option>)}</select></Field>
                <Field label="Alasan (wajib)"><input className="input" name="reason" required minLength={3} /></Field>
                <SubmitButton confirm="Ubah status unit ini?">Ubah status</SubmitButton>
              </ActionForm>)}
          </Card>)}

        <Card title="Garansi" className="lg:col-span-1">
          {wars.length === 0 ? <p className="text-sm text-ink-500">Belum ada data garansi. Garansi toko tercatat saat unit terjual bila masa garansi sudah diatur.</p> : (
            <ul className="space-y-2 text-sm">{wars.map((w, i) => (<li key={i}>{w.kind === 'toko' ? 'Toko' : 'Produsen'}: {fdate(w.start_date)} – {fdate(w.end_date)} {w.voided ? <span className="text-bad">(dibatalkan)</span> : !w.verified ? <span className="text-warn">(belum diverifikasi)</span> : new Date(w.end_date) < new Date() ? <span className="text-bad">(berakhir)</span> : <span className="text-ok">(aktif)</span>}</li>))}</ul>)}
        </Card>
        <Card title="Riwayat penjualan & retur" className="lg:col-span-2">
          {sales.length === 0 ? <p className="text-sm text-ink-500">Belum pernah terjual.</p> : (
            <ul className="space-y-2 text-sm">{sales.map((s) => (<li key={s.id} className="flex flex-wrap items-center gap-2"><Link className="text-brand underline" href={`/sales/${s.sales?.id}`}>{s.sales?.invoice_no}</Link><span>{fdate(s.sales?.sold_at)} · {rupiah(s.line_total)} · {s.sales?.customers?.name ?? 'tanpa nama'}</span><StatusBadge map={SALE_STATUS} value={s.sales?.status} />{!s.active && <span className="text-xs text-ink-500">(tidak aktif)</span>}</li>))}</ul>)}
          {rets.length > 0 && <ul className="mt-3 space-y-1 border-t border-ink-300/40 pt-3 text-sm">{rets.map((r, i) => <li key={i}>Retur {fdate(r.created_at)} ({r.sales?.invoice_no}): {r.reason} · refund {rupiah(r.refund_amount)}</li>)}</ul>}
        </Card>

        <Card title="Klaim / tiket layanan" className="lg:col-span-3">
          {tickets.length === 0 ? <p className="text-sm text-ink-500">Tidak ada tiket.</p> : (
            <ul className="space-y-2 text-sm">{tickets.map((t) => (<li key={t.id} className="flex flex-wrap items-center gap-2"><Link className="text-brand underline" href={`/service/${t.id}`}>{t.ticket_no}</Link><span>{t.category} · {fdate(t.received_at)}</span><StatusBadge map={TICKET_STATUS} value={t.status} /><StatusBadge map={WARRANTY_STATE} value={t.warranty_state} /></li>))}</ul>)}
        </Card>

        <Card title="Catatan pemeriksaan perangkat" className="lg:col-span-2">
          {insp.length === 0 ? <Empty title="Belum ada pemeriksaan" /> : (
            <ul className="space-y-3 text-sm">{insp.map((i) => (<li key={i.id}><div className="font-medium">{fdate(i.checked_at)} · {i.profiles?.full_name ?? '-'}</div>
              <div className="text-ink-500">Lolos: {Object.entries(i.checklist as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k).join(', ') || '—'}; gagal/tidak dicek: {Object.entries(i.checklist as Record<string, boolean>).filter(([, v]) => !v).map(([k]) => k).join(', ') || '—'}</div>{i.notes && <div>{i.notes}</div>}</li>))}</ul>)}
        </Card>
        {write && (
          <Card title="Tambah pemeriksaan">
            <ActionForm action={addInspectionAction} resetOnSuccess className="space-y-2 text-sm">
              <input type="hidden" name="unit_id" value={unit.id} />
              <div className="grid grid-cols-2 gap-1">{['layar', 'keyboard', 'touchpad', 'baterai', 'charger', 'port', 'wifi', 'kamera', 'speaker', 'storage'].map((k) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name={`chk_${k}`} /> {k}</label>)}</div>
              <textarea className="input" name="notes" rows={2} placeholder="Catatan" />
              <SubmitButton>Simpan pemeriksaan</SubmitButton>
            </ActionForm>
          </Card>)}

        <Card title="Riwayat stok & perpindahan cabang" className="lg:col-span-3">
          <ul className="divide-y divide-ink-300/30 text-sm">{moves.map((m, i) => (<li key={i} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{MOVEMENT[m.type] ?? m.type} · {m.branches?.name} {m.reason ? `· ${m.reason}` : ''}</span><span className="text-ink-500">{fdatetime(m.created_at)} · {m.profiles?.full_name ?? 'sistem/seed'}</span></li>))}</ul>
        </Card>
      </div>
    </>
  );
}
