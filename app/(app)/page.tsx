import Link from 'next/link';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { can } from '@/lib/permissions';
import { addDays, endOfDay, fdatetime, isYmd, nf, rupiah, startOfDay, ymdWIB } from '@/lib/format';
import { MOVEMENT } from '@/lib/labels';
import { Card, Empty, Field, PageHeader, Stat } from '@/components/ui';
import { BarSimple, SalesLine } from '@/components/Charts';

type SP = Promise<Record<string, string | string[] | undefined>>;
const VALID = ['completed', 'partially_returned', 'returned']; // semua transaksi yang tidak dibatalkan (bruto); refund retur dilihat di Laporan

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage('dashboard.view');
  const sp = await searchParams;
  const today = ymdWIB();
  const to = isYmd(sp.to) ? sp.to : today;
  let from = isYmd(sp.from) ? sp.from : addDays(to, -29);
  if (from > to) from = to;
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (span > 92) from = addDays(to, -91);
  const sb = ctx.sb, ids = ctx.branchIds, scope = ctx.scope;

  if (ctx.role === 'hr') {
    return (<><PageHeader title="Dashboard" /><Empty title={`Selamat datang, ${ctx.profile!.full_name}`} hint="Peran HR belum memiliki modul operasional. Hubungi Super Admin bila memerlukan akses tambahan." /></>);
  }

  const canOps = can(ctx.role, 'inventory.view');
  const [products, stock, sales, items, tickets, moves, audits] = await Promise.all([
    canOps ? run<{ id: string; name: string; tracking: string; min_stock: number | null; archived: boolean }[]>('dash produk', () => sb.from('products').select('id,name,tracking,min_stock,archived').eq('archived', false).limit(2000)) : [],
    canOps ? run<{ product_id: string; available: number; total: number }[]>('dash stok', () => sb.from('product_stock').select('product_id,available,total').in('branch_id', ids)) : [],
    can(ctx.role, 'sales.view') ? run<{ sold_at: string; total: number; branch_id: string }[]>('dash penjualan', () =>
      sb.from('sales').select('sold_at,total,branch_id').eq('data_origin', scope).in('branch_id', ids).in('status', VALID).gte('sold_at', startOfDay(from)).lte('sold_at', endOfDay(to)).order('sold_at').limit(5000)) : [],
    can(ctx.role, 'sales.view') ? run<{ line_total: number; products: { categories: { name: string } | null } | null }[]>('dash kategori', () =>
      sb.from('sale_items').select('line_total, products(categories(name)), sales!inner(sold_at,branch_id,data_origin,status)')
        .eq('sales.data_origin', scope).in('sales.branch_id', ids).in('sales.status', VALID).gte('sales.sold_at', startOfDay(from)).lte('sales.sold_at', endOfDay(to)).limit(5000)) : [],
    can(ctx.role, 'service.view') ? run<{ status: string }[]>('dash tiket', () => sb.from('service_tickets').select('status').eq('data_origin', scope).in('branch_id', ids).limit(5000)) : [],
    canOps ? run<{ type: string; qty: number; created_at: string; products: { name: string } | null; branches: { name: string } | null }[]>('dash gerak', () =>
      sb.from('stock_movements').select('type,qty,created_at,products(name),branches(name)').eq('data_origin', scope).in('branch_id', ids).order('created_at', { ascending: false }).limit(8)) : [],
    can(ctx.role, 'audit.view') ? run<{ at: string; action: string; entity: string | null }[]>('dash audit', () => sb.from('audit_logs').select('at,action,entity').in('branch_id', ids).order('at', { ascending: false }).limit(6)) : [],
  ]);
  let soldCount = 0;
  if (canOps) {
    const r = await sb.from('inventory_units').select('id', { count: 'exact', head: true }).eq('status', 'sold').eq('data_origin', scope).in('branch_id', ids);
    if (r.error) throw Object.assign(new Error('Gagal memuat jumlah unit terjual'), { cause: r.error });
    soldCount = r.count ?? 0;
  }

  const tracking = new Map(products.map((p) => [p.id, p.tracking]));
  let unitsTotal = 0, unitsAvail = 0, accQty = 0;
  const perProduct = new Map<string, number>();
  stock.forEach((s) => {
    if (tracking.get(s.product_id) === 'serialized') { unitsTotal += s.total; unitsAvail += s.available; } else accQty += s.available;
    perProduct.set(s.product_id, (perProduct.get(s.product_id) ?? 0) + s.available);
  });
  const productsInScope = new Set(stock.filter((s) => s.total > 0).map((s) => s.product_id)).size;
  const withMin = products.filter((p) => p.min_stock != null);
  const low = withMin.filter((p) => (perProduct.get(p.id) ?? 0) <= (p.min_stock as number));

  const revenue = sales.reduce((a, s) => a + Number(s.total), 0);
  const daily = new Map<string, { total: number; count: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) daily.set(d, { total: 0, count: 0 });
  sales.forEach((s) => { const k = ymdWIB(new Date(s.sold_at)); const r = daily.get(k); if (r) { r.total += Number(s.total); r.count++; } });
  const series = [...daily.entries()].map(([d, v]) => ({ label: d.slice(5), ...v }));
  const cat = new Map<string, number>();
  items.forEach((i) => { const n = i.products?.categories?.name ?? 'Tanpa kategori'; cat.set(n, (cat.get(n) ?? 0) + Number(i.line_total)); });
  const catData = [...cat.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const byBranch = new Map<string, number>();
  sales.forEach((s) => byBranch.set(s.branch_id, (byBranch.get(s.branch_id) ?? 0) + Number(s.total)));
  const branchData = ctx.scopeBranches.map((b) => ({ name: b.name, value: byBranch.get(b.id) ?? 0 }));
  const tk = { open: 0, done: 0 } as Record<string, number>;
  tickets.forEach((t) => { if (t.status === 'selesai' || t.status === 'ditolak') tk.done++; else tk.open++; });

  return (
    <>
      <PageHeader title="Dashboard" sub={`${ctx.branch ? ctx.branch.name : 'Semua cabang'} · ${scope === 'demo' ? 'DATA DEMO (sintetis)' : 'Data nyata'}`}
        actions={
          <form className="flex flex-wrap items-end gap-2" method="get">
            <Field label="Dari"><input type="date" name="from" defaultValue={from} className="input" /></Field>
            <Field label="Sampai"><input type="date" name="to" defaultValue={to} className="input" /></Field>
            <button className="btn-primary">Terapkan</button>
          </form>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canOps && <Stat label="Produk berstok" value={nf(productsInScope)} hint={`${nf(unitsTotal)} unit berseri · ${nf(accQty)} pcs aksesori`} />}
        {canOps && <Stat label="Unit tersedia" value={nf(unitsAvail)} hint={`${nf(soldCount)} unit berstatus terjual`} />}
        {canOps && <Stat label="Stok menipis" value={withMin.length ? nf(low.length) : '—'} tone={low.length ? 'warn' : undefined}
          hint={withMin.length ? <Link className="underline" href="/inventory?view=low">Lihat produk</Link> : 'Batas minimal belum diatur di produk'} />}
        {can(ctx.role, 'sales.view') && <Stat label="Omzet bruto (tidak dibatalkan)" value={rupiah(revenue)} hint={`${nf(sales.length)} transaksi · ${from} s/d ${to}`} />}
      </div>

      {can(ctx.role, 'sales.view') && (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Card title="Omzet harian" className="xl:col-span-2">
            {sales.length === 0 ? <Empty title="Belum ada transaksi pada periode ini" hint={scope === 'real' ? 'Transaksi akan muncul setelah penjualan pertama dicatat di menu Penjualan (POS).' : undefined} /> : <SalesLine data={series} />}
            {sales.length >= 5000 && <p className="mt-2 text-xs text-warn">Data dipotong 5.000 transaksi; persempit periode.</p>}
          </Card>
          <Card title="Omzet per kategori">
            {catData.length === 0 ? <Empty title="Belum ada data" /> : <BarSimple data={catData} money label="Omzet per kategori" />}
          </Card>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {can(ctx.role, 'service.view') && (
          <Card title="Customer service & garansi">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-ink-500">Tiket terbuka</dt><dd className="text-2xl font-semibold">{nf(tk.open)}</dd></div>
              <div><dt className="text-ink-500">Tiket selesai/ditolak</dt><dd className="text-2xl font-semibold">{nf(tk.done)}</dd></div>
            </dl>
            <Link className="mt-3 inline-block text-sm text-brand underline" href="/service">Buka tiket</Link>
          </Card>
        )}
        {ctx.scopeBranches.length > 1 && can(ctx.role, 'sales.view') && (
          <Card title="Perbandingan antar-cabang (omzet)">{branchData.every((b) => b.value === 0) ? <Empty title="Belum ada transaksi" /> : <BarSimple data={branchData} money label="Omzet per cabang" />}</Card>
        )}
        {canOps && (
          <Card title="Pergerakan stok terbaru">
            {moves.length === 0 ? <Empty title="Belum ada pergerakan" /> : (
              <ul className="space-y-2 text-sm">{moves.map((m, i) => (
                <li key={i} className="flex justify-between gap-2"><span className="truncate">{MOVEMENT[m.type] ?? m.type} · {m.products?.name}</span>
                  <span className={m.qty < 0 ? 'text-bad' : 'text-ok'}>{m.qty > 0 ? '+' : ''}{m.qty}</span></li>))}</ul>)}
          </Card>
        )}
      </div>

      {audits.length > 0 && (
        <Card title="Aktivitas terbaru" className="mt-4">
          <ul className="divide-y divide-ink-300/30 text-sm">{audits.map((a, i) => (<li key={i} className="flex justify-between py-1.5"><span>{a.action}{a.entity ? ` · ${a.entity}` : ''}</span><span className="text-ink-500">{fdatetime(a.at)}</span></li>))}</ul>
        </Card>
      )}
    </>
  );
}
