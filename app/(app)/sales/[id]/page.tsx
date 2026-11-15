import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { can } from '@/lib/permissions';
import { PAY_STATUS, SALE_STATUS } from '@/lib/labels';
import { fdate, fdatetime, rupiah } from '@/lib/format';
import { Card, Chip, PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { PrintButton } from '@/components/PrintButton';
import { returnItemAction, voidSaleAction } from '../actions';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const pctText = (v: unknown) => `${Number(v ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;

export default async function SaleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requirePage('sales.view');
  const sb = ctx.sb;
  const s = await run<Row | null>('transaksi', () => sb.from('sales').select('*, customers(name,phone,address), branches(name,city), profiles:cashier_id(full_name)').eq('id', id).maybeSingle());
  if (!s) notFound();
  const [items, pays, rets] = await Promise.all([
    run<Row[]>('item', () => sb.from('sale_items').select('id,qty,unit_price,discount,line_total,active,unit_id,products(name,sku),inventory_units(internal_asset_code,serial_number)').eq('sale_id', id).order('id')),
    run<Row[]>('bayar', () => sb.from('payments').select('method,amount,paid_at,reference,tendered,change_amount,note,verified_at,verifier:verified_by(full_name)').eq('sale_id', id).order('paid_at')),
    run<Row[]>('retur', () => sb.from('returns').select('sale_item_id,qty,reason,refund_amount,created_at').eq('sale_id', id)),
  ]);
  const retBy = new Map<string, number>();
  rets.forEach((r) => retBy.set(r.sale_item_id, (retBy.get(r.sale_item_id) ?? 0) + r.qty));
  const pay = pays[0];
  const paidTotal = pays.reduce((a, p) => a + Number(p.amount), 0);
  const canVoid = can(ctx.role, 'sales.void') && s.status === 'completed';
  const canRet = can(ctx.role, 'sales.return') && (s.status === 'completed' || s.status === 'partially_returned');
  const afterDisc = Number(s.subtotal) - Number(s.discount);
  const cust = s.customers as Row | null;
  const method = pay?.method ?? s.payment_method ?? '-';
  return (
    <>
      <PageHeader title={`Detail Transaksi ${s.invoice_no}`}
        sub={<span className="flex flex-wrap items-center gap-2"><StatusBadge map={SALE_STATUS} value={s.status} /><StatusBadge map={PAY_STATUS} value={s.payment_status} /></span>}
        actions={<>
          <a className="btn-primary no-print" href={`/print/thermal/${s.id}?w=80`} target="_blank" rel="noopener">Cetak Struk</a>
          <a className="btn-ghost no-print" href={`/print/invoice/${s.id}`} target="_blank" rel="noopener">Cetak Invoice</a>
          <a className="btn-ghost no-print" href={`/print/delivery/${s.id}`} target="_blank" rel="noopener">Surat Jalan</a>
          <PrintButton label="Cetak halaman" /><Link className="btn-ghost no-print" href="/sales">Kembali ke Riwayat</Link></>} />

      <div className="grid max-w-5xl gap-4 lg:grid-cols-3">
        <Card title="Informasi transaksi" className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-ink-500">Nomor invoice</dt><dd className="font-mono font-semibold">{s.invoice_no}</dd></div>
            <div><dt className="text-xs text-ink-500">Tanggal & waktu</dt><dd className="font-medium">{fdatetime(s.sold_at)} WIB</dd></div>
            <div><dt className="text-xs text-ink-500">Kasir / pemroses</dt><dd className="font-medium">{s.profiles?.full_name ?? '-'}</dd></div>
            <div><dt className="text-xs text-ink-500">Lokasi</dt><dd className="font-medium">{s.branches?.name}{s.branches?.city ? `, ${s.branches.city}` : ''}</dd></div>
            <div><dt className="text-xs text-ink-500">Metode pembayaran</dt><dd className="font-medium">{method}</dd></div>
            <div><dt className="text-xs text-ink-500">Status pembayaran</dt><dd className="mt-0.5"><StatusBadge map={PAY_STATUS} value={s.payment_status} /></dd></div>
          </dl>
        </Card>
        <Card title="Pelanggan">
          {cust ? (
            <dl className="space-y-1 text-sm"><dd className="font-semibold">{cust.name}</dd>{cust.phone && <dd>Telp. {cust.phone}</dd>}{cust.address && <dd className="text-ink-500">{cust.address}</dd>}</dl>
          ) : <p className="text-sm text-ink-500">Pelanggan umum (tidak dicatat).</p>}
        </Card>
      </div>

      <Card title="Produk yang dibeli" className="mt-4 max-w-5xl">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="tbl min-w-[640px]"><thead><tr><th>Produk</th><th>SKU</th><th>Nomor seri</th><th className="text-right">Harga satuan</th><th className="text-right">Jml</th><th className="text-right">Subtotal</th></tr></thead><tbody>
            {items.map((i) => (
              <tr key={i.id} className={i.active ? '' : 'text-ink-500 line-through'}>
                <td className="min-w-[200px]">{i.products?.name}{Number(i.discount) > 0 && <div className="text-xs text-ink-500">Diskon item {rupiah(i.discount)}</div>}</td>
                <td><Chip>{i.products?.sku ?? '-'}</Chip></td>
                <td>{i.inventory_units ? <div className="space-y-0.5"><div>{i.inventory_units.serial_number ? <Chip>{i.inventory_units.serial_number}</Chip> : <span className="text-xs text-warn no-underline">belum ada nomor seri</span>}</div><div className="text-xs text-ink-500">{i.inventory_units.internal_asset_code}</div></div> : <span className="text-ink-500">—</span>}</td>
                <td className="text-right">{rupiah(i.unit_price)}</td><td className="text-right">{i.qty}</td><td className="text-right">{rupiah(i.line_total)}</td>
              </tr>))}
          </tbody></table>
        </div>
        <div className="ml-auto mt-4 max-w-sm space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{rupiah(s.subtotal)}</span></div>
          <div className="flex justify-between"><span>Diskon{Number(s.discount_percent) > 0 ? ` (${pctText(s.discount_percent)})` : ''}</span><span>− {rupiah(s.discount)}</span></div>
          {Number(s.discount) > 0 && <div className="flex justify-between text-ink-500"><span>Setelah diskon</span><span>{rupiah(afterDisc)}</span></div>}
          <div className="flex justify-between"><span>Pajak{Number(s.tax_percent) > 0 ? ` (${pctText(s.tax_percent)})` : ''}</span><span>+ {rupiah(s.tax)}</span></div>
          <div className="flex justify-between border-t border-ink-300/60 pt-1 text-lg font-semibold"><span>Total pembayaran</span><span>{rupiah(s.total)}</span></div>
          {pay?.tendered != null && Number(pay.tendered) !== Number(s.total) && <div className="flex justify-between"><span>Uang diterima</span><span>{rupiah(pay.tendered)}</span></div>}
          {pay?.change_amount != null && Number(pay.change_amount) > 0 && <div className="flex justify-between"><span>Kembalian</span><span>{rupiah(pay.change_amount)}</span></div>}
          {paidTotal < Number(s.total) && <div className="flex justify-between text-bad"><span>Sisa tagihan</span><span>{rupiah(Number(s.total) - paidTotal)}</span></div>}
        </div>
        {s.void_reason && <p className="mt-3 text-sm text-bad">Dibatalkan: {s.void_reason}</p>}
        {s.notes && <p className="mt-3 text-sm text-ink-500">Catatan: {s.notes}</p>}
        <p className="mt-4 text-xs text-ink-500">Masa garansi mengikuti data garansi unit pada sistem; periksa menu Garansi.</p>
      </Card>

      <Card title="Rincian pembayaran" className="mt-4 max-w-5xl">
        {pays.length === 0 ? <p className="text-sm text-ink-500">Belum ada pembayaran tercatat.</p> : (
          <div className="-mx-4 overflow-x-auto px-4"><table className="tbl min-w-[560px]"><thead><tr><th>Waktu</th><th>Metode</th><th className="text-right">Jumlah</th><th>Referensi / keterangan</th><th>Dikonfirmasi oleh</th></tr></thead><tbody>
            {pays.map((p, i) => (<tr key={i}><td className="whitespace-nowrap">{fdatetime(p.paid_at)}</td><td>{p.method}</td><td className="text-right">{rupiah(p.amount)}</td>
              <td className="text-xs">{p.reference && <Chip>{p.reference}</Chip>} {p.note}</td><td className="text-xs">{p.verifier?.full_name ?? '-'}{p.verified_at ? <div className="text-ink-500">{fdatetime(p.verified_at)}</div> : null}</td></tr>))}
          </tbody></table></div>)}
      </Card>

      {rets.length > 0 && <Card title="Retur tercatat" className="mt-4 max-w-5xl"><ul className="space-y-1 text-sm">{rets.map((r, i) => <li key={i}>{fdate(r.created_at)} · {r.qty} pcs · {r.reason} · refund {rupiah(r.refund_amount)}</li>)}</ul></Card>}

      {(canRet || canVoid) && (
        <div className="no-print mt-4 grid max-w-5xl gap-4 sm:grid-cols-2">
          {canRet && (
            <Card title="Retur item">
              <div className="space-y-3">{items.filter((i) => i.active).map((i) => (
                <ActionForm key={i.id} action={returnItemAction} className="space-y-2 rounded border border-ink-300/50 p-2 text-sm">
                  <input type="hidden" name="item_id" value={i.id} /><input type="hidden" name="sale_id" value={s.id} />
                  <div className="font-medium">{i.products?.name}</div>
                  <div className="flex gap-2"><input className="input w-20" type="number" name="qty" min={1} max={i.qty - (retBy.get(i.id) ?? 0)} defaultValue={1} aria-label="Jumlah" /><input className="input" type="number" name="refund" min={0} max={Number(i.line_total)} placeholder="Refund (Rp)" aria-label="Refund" /></div>
                  <input className="input" name="reason" required minLength={3} placeholder="Alasan retur (wajib)" />
                  <SubmitButton className="btn-ghost" confirm="Catat retur item ini?">Retur</SubmitButton>
                </ActionForm>))}</div>
            </Card>)}
          {canVoid && (
            <Card title="Batalkan transaksi">
              <ActionForm action={voidSaleAction} className="space-y-2">
                <input type="hidden" name="id" value={s.id} />
                <input className="input" name="reason" required minLength={3} placeholder="Alasan pembatalan (wajib)" />
                <SubmitButton className="btn-danger" confirm="Batalkan seluruh transaksi? Stok dikembalikan dan tindakan ini tercatat di audit log.">Batalkan transaksi</SubmitButton>
              </ActionForm>
            </Card>)}
        </div>)}
    </>
  );
}
