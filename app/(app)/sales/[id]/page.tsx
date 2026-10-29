import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { can } from '@/lib/permissions';
import { PAY_STATUS, SALE_STATUS } from '@/lib/labels';
import { fdate, fdatetime, rupiah } from '@/lib/format';
import { Card, Chip, DemoTag, PageHeader, StatusBadge } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { PrintButton } from '@/components/PrintButton';
import { returnItemAction, voidSaleAction } from '../actions';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function SaleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requirePage('sales.view');
  const sb = ctx.sb;
  const s = await run<Row | null>('transaksi', () => sb.from('sales').select('*, customers(name,phone,address), branches(name,city,is_demo), profiles(full_name)').eq('id', id).maybeSingle());
  if (!s) notFound();
  const [items, pays, rets] = await Promise.all([
    run<Row[]>('item', () => sb.from('sale_items').select('id,qty,unit_price,discount,line_total,active,unit_id,products(name,sku),inventory_units(internal_asset_code,serial_number)').eq('sale_id', id)),
    run<Row[]>('bayar', () => sb.from('payments').select('method,amount,paid_at').eq('sale_id', id)),
    run<Row[]>('retur', () => sb.from('returns').select('sale_item_id,qty,reason,refund_amount,created_at').eq('sale_id', id)),
  ]);
  const retBy = new Map<string, number>();
  rets.forEach((r) => retBy.set(r.sale_item_id, (retBy.get(r.sale_item_id) ?? 0) + r.qty));
  const paidTotal = pays.reduce((a, p) => a + Number(p.amount), 0);
  const canVoid = can(ctx.role, 'sales.void') && s.status === 'completed';
  const canRet = can(ctx.role, 'sales.return') && (s.status === 'completed' || s.status === 'partially_returned');
  return (
    <>
      <PageHeader title={`Invoice ${s.invoice_no}`} sub={<span className="flex items-center gap-2"><StatusBadge map={SALE_STATUS} value={s.status} /><StatusBadge map={PAY_STATUS} value={s.payment_status} />{s.branches?.is_demo && <DemoTag />}</span>}
        actions={<><PrintButton label="Cetak struk / PDF" /><Link className="btn-ghost no-print" href="/sales">Kembali</Link></>} />
      <Card className="max-w-3xl">
        <div className="mb-4 border-b border-dashed border-ink-300 pb-3 text-sm">
          <div className="text-lg font-semibold">Adrian Laptop Store — {s.branches?.name}</div>
          <div className="text-ink-500">{fdatetime(s.sold_at)} · Kasir: {s.profiles?.full_name ?? '-'}</div>
          <div>Pelanggan: {s.customers?.name ?? 'Umum'} {s.customers?.phone ? `· ${s.customers.phone}` : ''}</div>
          {s.data_origin === 'demo' && <div className="font-medium text-demo">DATA DEMO — bukan transaksi nyata</div>}
        </div>
        <table className="tbl"><thead><tr><th>Item</th><th className="text-right">Jml</th><th className="text-right">Harga</th><th className="text-right">Diskon</th><th className="text-right">Total</th></tr></thead><tbody>
          {items.map((i) => (<tr key={i.id} className={i.active ? '' : 'text-ink-500 line-through'}>
            <td><div>{i.products?.name}</div>{i.inventory_units && <div className="no-underline"><Chip>{i.inventory_units.internal_asset_code}</Chip>{i.inventory_units.serial_number && <> <Chip>SN {i.inventory_units.serial_number}</Chip></>}</div>}</td>
            <td className="text-right">{i.qty}</td><td className="text-right">{rupiah(i.unit_price)}</td><td className="text-right">{rupiah(i.discount)}</td><td className="text-right">{rupiah(i.line_total)}</td></tr>))}
        </tbody></table>
        <div className="ml-auto mt-3 max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{rupiah(s.subtotal)}</span></div>
          <div className="flex justify-between"><span>Diskon</span><span>- {rupiah(s.discount)}</span></div>
          <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{rupiah(s.total)}</span></div>
          <div className="flex justify-between"><span>Dibayar ({s.payment_method ?? '-'})</span><span>{rupiah(paidTotal)}</span></div>
          {paidTotal < Number(s.total) && <div className="flex justify-between text-bad"><span>Sisa</span><span>{rupiah(Number(s.total) - paidTotal)}</span></div>}
        </div>
        {s.void_reason && <p className="mt-3 text-sm text-bad">Dibatalkan: {s.void_reason}</p>}
        {s.notes && <p className="mt-3 text-sm text-ink-500">Catatan: {s.notes}</p>}
        <p className="mt-4 text-xs text-ink-500">Masa garansi mengikuti data garansi unit pada sistem; periksa menu Garansi.</p>
      </Card>

      {rets.length > 0 && <Card title="Retur tercatat" className="mt-4 max-w-3xl"><ul className="space-y-1 text-sm">{rets.map((r, i) => <li key={i}>{fdate(r.created_at)} · {r.qty} pcs · {r.reason} · refund {rupiah(r.refund_amount)}</li>)}</ul></Card>}

      {(canRet || canVoid) && (
        <div className="no-print mt-4 grid max-w-3xl gap-4 sm:grid-cols-2">
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
