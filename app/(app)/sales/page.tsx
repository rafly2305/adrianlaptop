import Link from 'next/link';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { PAY_STATUS, SALE_STATUS } from '@/lib/labels';
import { addDays, endOfDay, fdatetime, isYmd, rupiah, safeLike, startOfDay, ymdWIB } from '@/lib/format';
import { Chip, DemoTag, Empty, PageHeader, Pagination, StatusBadge, TableWrap, one, pageNum } from '@/components/ui';
import { can } from '@/lib/permissions';

const PS = 25;
export default async function SalesList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage('sales.view');
  const sp = await searchParams;
  const to = isYmd(sp.to) ? sp.to : ymdWIB();
  const from = isYmd(sp.from) ? sp.from : addDays(to, -29);
  const q = safeLike(one(sp.q) ?? ''), status = one(sp.status) ?? '', page = pageNum(sp.page);
  let cids: string[] = [];
  if (q) cids = (await run<{ id: string }[]>('cari pelanggan', () => ctx.sb.from('customers').select('id').in('branch_id', ctx.branchIds).or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(100))).map((c) => c.id);
  let query = ctx.sb.from('sales').select('id,invoice_no,sold_at,total,status,payment_status,payment_method,customers(name),branches(name,is_demo)', { count: 'exact' })
    .eq('data_origin', ctx.scope).in('branch_id', ctx.branchIds).gte('sold_at', startOfDay(from)).lte('sold_at', endOfDay(to)).order('sold_at', { ascending: false }).range((page - 1) * PS, page * PS - 1);
  if (q) query = query.or(`invoice_no.ilike.%${q}%${cids.length ? `,customer_id.in.(${cids.join(',')})` : ''}`);
  if (status) query = query.eq('status', status);
  const { data, count, error } = await query;
  if (error) throw Object.assign(new Error('Gagal memuat transaksi'), { cause: error });
  const rows = (data ?? []) as unknown as { id: string; invoice_no: string; sold_at: string; total: number; status: string; payment_status: string; payment_method: string | null; customers: { name: string } | null; branches: { name: string; is_demo: boolean } | null }[];
  return (
    <>
      <PageHeader title="Riwayat transaksi" actions={<>{can(ctx.role, 'pos.sell') && <Link className="btn-primary" href="/pos">Transaksi baru</Link>}{can(ctx.role, 'reports.view') && <a className="btn-ghost" href={`/api/export/sales?from=${from}&to=${to}`}>Ekspor CSV</a>}</>} />
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <input className="input w-56" name="q" defaultValue={q} placeholder="Invoice / pelanggan / telepon" aria-label="Cari" />
        <input className="input w-auto" type="date" name="from" defaultValue={from} aria-label="Dari" /><input className="input w-auto" type="date" name="to" defaultValue={to} aria-label="Sampai" />
        <select className="input w-auto" name="status" defaultValue={status} aria-label="Status"><option value="">Semua status</option>{Object.entries(SALE_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="btn-primary">Terapkan</button>
      </form>
      {rows.length === 0 ? <Empty title="Belum ada transaksi pada filter ini" hint={ctx.scope === 'real' ? 'Transaksi nyata akan muncul setelah penjualan dicatat lewat menu POS.' : undefined} /> : (
        <TableWrap><table className="tbl"><thead><tr><th>Invoice</th><th>Waktu</th><th>Cabang</th><th>Pelanggan</th><th className="text-right">Total</th><th>Bayar</th><th>Status</th></tr></thead><tbody>
          {rows.map((s) => (<tr key={s.id}><td><Link className="text-brand underline" href={`/sales/${s.id}`}><Chip>{s.invoice_no}</Chip></Link></td><td>{fdatetime(s.sold_at)}</td><td>{s.branches?.name} {s.branches?.is_demo && <DemoTag />}</td><td>{s.customers?.name ?? 'Umum'}</td><td className="text-right">{rupiah(s.total)}</td><td><StatusBadge map={PAY_STATUS} value={s.payment_status} /> <span className="text-xs text-ink-500">{s.payment_method}</span></td><td><StatusBadge map={SALE_STATUS} value={s.status} /></td></tr>))}
        </tbody></table></TableWrap>)}
      <Pagination page={page} pageSize={PS} total={count ?? 0} basePath="/sales" params={{ q, from, to, status }} />
    </>
  );
}
