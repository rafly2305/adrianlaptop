import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { addDays, endOfDay, fdate, isYmd, nf, rupiah, startOfDay, ymdWIB } from '@/lib/format';
import { Card, Empty, PageHeader, Stat, TableWrap } from '@/components/ui';
import { PrintButton } from '@/components/PrintButton';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage('reports.view');
  const sp = await searchParams;
  const to = isYmd(sp.to) ? sp.to : ymdWIB();
  const from = isYmd(sp.from) ? sp.from : addDays(to, -29);
  const sb = ctx.sb, ids = ctx.branchIds, scope = ctx.scope;
  const [sales, refunds, items] = await Promise.all([
    run<Row[]>('lap penjualan', () => sb.from('sales').select('sold_at,total,discount,status,payment_method,payment_status,branch_id').eq('data_origin', scope).in('branch_id', ids).gte('sold_at', startOfDay(from)).lte('sold_at', endOfDay(to)).limit(10000)),
    run<Row[]>('lap refund', () => sb.from('returns').select('refund_amount,sales!inner(branch_id)').eq('data_origin', scope).in('sales.branch_id', ids).gte('created_at', startOfDay(from)).lte('created_at', endOfDay(to)).limit(10000)),
    run<Row[]>('lap item', () => sb.from('sale_items').select('qty,line_total,products(name,sku),sales!inner(sold_at,branch_id,data_origin,status)').eq('sales.data_origin', scope).in('sales.branch_id', ids).neq('sales.status', 'void').gte('sales.sold_at', startOfDay(from)).lte('sales.sold_at', endOfDay(to)).limit(10000)),
  ]);
  const valid = sales.filter((s) => s.status !== 'void');
  const voided = sales.filter((s) => s.status === 'void');
  const gross = valid.reduce((a, s) => a + Number(s.total), 0);
  const disc = valid.reduce((a, s) => a + Number(s.discount), 0);
  const ref = refunds.reduce((a, r) => a + Number(r.refund_amount), 0);
  const group = (key: (s: Row) => string) => { const m = new Map<string, { n: number; t: number }>(); valid.forEach((s) => { const k = key(s); const x = m.get(k) ?? { n: 0, t: 0 }; x.n++; x.t += Number(s.total); m.set(k, x); }); return [...m.entries()].sort((a, b) => b[1].t - a[1].t); };
  const byDay = group((s) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(s.sold_at))).sort((a, b) => a[0].localeCompare(b[0]));
  const byMethod = group((s) => s.payment_method ?? '(belum dibayar)');
  const bName = new Map(ctx.scopeBranches.map((b) => [b.id, b.name]));
  const byBranch = group((s) => bName.get(s.branch_id) ?? 'Cabang');
  const prod = new Map<string, { q: number; t: number }>();
  items.forEach((i) => { const k = `${i.products?.sku} · ${i.products?.name}`; const x = prod.get(k) ?? { q: 0, t: 0 }; x.q += i.qty; x.t += Number(i.line_total); prod.set(k, x); });
  const top = [...prod.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 10);
  const trunc = sales.length >= 10000;
  return (
    <>
      <PageHeader title="Laporan penjualan" sub={`${ctx.branch?.name ?? 'Semua cabang'} · ${fdate(from)} – ${fdate(to)} · ${scope === 'demo' ? 'DATA DEMO' : 'data nyata'}`}
        actions={<><PrintButton /><a className="btn-ghost no-print" href={`/api/export/sales?from=${from}&to=${to}`}>Ekspor CSV</a></>} />
      <form className="no-print mb-4 flex flex-wrap items-end gap-2" method="get">
        <input className="input w-auto" type="date" name="from" defaultValue={from} aria-label="Dari" /><input className="input w-auto" type="date" name="to" defaultValue={to} aria-label="Sampai" /><button className="btn-primary">Terapkan</button>
      </form>
      {trunc && <p className="mb-3 rounded bg-warn-soft px-3 py-2 text-sm text-warn">Data dipotong 10.000 baris; persempit periode agar total akurat.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Omzet bruto" value={rupiah(gross)} hint={`${nf(valid.length)} transaksi (tanpa yang dibatalkan)`} />
        <Stat label="Refund retur" value={rupiah(ref)} hint="Retur yang dicatat pada periode ini" />
        <Stat label="Omzet neto" value={rupiah(gross - ref)} hint="Bruto − refund" />
        <Stat label="Dibatalkan" value={nf(voided.length)} hint={`Total diskon diberikan ${rupiah(disc)}`} />
      </div>
      {valid.length === 0 ? <div className="mt-4"><Empty title="Tidak ada transaksi pada periode ini" /></div> : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title="Per tanggal"><TableWrap><table className="tbl"><thead><tr><th>Tanggal</th><th className="text-right">Transaksi</th><th className="text-right">Omzet</th></tr></thead><tbody>{byDay.map(([d, v]) => <tr key={d}><td>{d}</td><td className="text-right">{v.n}</td><td className="text-right">{rupiah(v.t)}</td></tr>)}</tbody><tfoot><tr><th>Total</th><th className="text-right">{valid.length}</th><th className="text-right">{rupiah(gross)}</th></tr></tfoot></table></TableWrap></Card>
          <div className="space-y-4">
            <Card title="Per cabang"><table className="tbl"><tbody>{byBranch.map(([k, v]) => <tr key={k}><td>{k}</td><td className="text-right">{v.n}</td><td className="text-right">{rupiah(v.t)}</td></tr>)}</tbody></table></Card>
            <Card title="Per metode pembayaran"><table className="tbl"><tbody>{byMethod.map(([k, v]) => <tr key={k}><td>{k}</td><td className="text-right">{v.n}</td><td className="text-right">{rupiah(v.t)}</td></tr>)}</tbody></table></Card>
            <Card title="10 produk teratas (omzet)"><table className="tbl"><tbody>{top.map(([k, v]) => <tr key={k}><td>{k}</td><td className="text-right">{v.q} pcs</td><td className="text-right">{rupiah(v.t)}</td></tr>)}</tbody></table></Card>
          </div>
        </div>)}
    </>
  );
}
