import Link from 'next/link';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { MOVEMENT } from '@/lib/labels';
import { fdatetime, nf, rupiah } from '@/lib/format';
import { Badge, Card, Empty, PageHeader, Stat, TableWrap, one } from '@/components/ui';

type P = { id: string; sku: string; name: string; default_price: number | null; min_stock: number | null; category_id: string | null };
type S = { product_id: string; branch_id: string; available: number; total: number };
type M = { id: string; created_at: string; type: string; qty: number; stock_before: number | null; stock_after: number | null; reason: string | null; ref_no: string | null; products: { name: string } | null; branches: { name: string } | null };

export default async function InventorySummary({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage('inventory.view');
  const sp = await searchParams;
  const cat = one(sp.cat) ?? '';
  const ids = ctx.branchIds;
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [cats, prods, stock, recent, mv30] = await Promise.all([
    run<{ id: string; name: string }[]>('kategori', () => ctx.sb.from('categories').select('id,name').order('name')),
    run<P[]>('produk', () => ctx.sb.from('products').select('id,sku,name,default_price,min_stock,category_id').eq('archived', false).limit(2000)),
    run<S[]>('stok', () => ctx.sb.from('product_stock').select('product_id,branch_id,available,total').in('branch_id', ids).limit(20000)),
    run<M[]>('gerak terbaru', () => ctx.sb.from('stock_movements').select('id,created_at,type,qty,stock_before,stock_after,reason,ref_no,products(name),branches(name)').in('branch_id', ids).order('created_at', { ascending: false }).limit(10)),
    run<{ type: string; qty: number }[]>('gerak 30 hari', () => ctx.sb.from('stock_movements').select('type,qty').in('branch_id', ids).gte('created_at', since).limit(20000)),
  ]);
  const list = cat ? prods.filter((p) => p.category_id === cat) : prods;
  const pset = new Set(list.map((p) => p.id));
  const rows = stock.filter((s) => pset.has(s.product_id));
  const byProd = new Map<string, { avail: number; total: number }>();
  const byBranch = new Map<string, { avail: number; products: number }>();
  rows.forEach((s) => {
    const a = byProd.get(s.product_id) ?? { avail: 0, total: 0 }; a.avail += s.available; a.total += s.total; byProd.set(s.product_id, a);
    const b = byBranch.get(s.branch_id) ?? { avail: 0, products: 0 }; b.avail += s.available; if (s.available > 0) b.products += 1; byBranch.set(s.branch_id, b);
  });
  let units = 0, low = 0, out = 0, value = 0, noPrice = 0, stocked = 0;
  list.forEach((p) => {
    const st = byProd.get(p.id) ?? { avail: 0, total: 0 };
    units += st.avail;
    if (st.avail > 0) { stocked += 1; if (p.default_price) value += st.avail * Number(p.default_price); else noPrice += 1; }
    if (st.avail === 0 && (st.total > 0 || p.min_stock != null)) out += 1;
    if (p.min_stock != null && st.avail > 0 && st.avail <= p.min_stock) low += 1;
  });
  const sum = (types: string[]) => mv30.filter((m) => types.includes(m.type)).reduce((a, m) => a + Math.abs(m.qty), 0);
  return (
    <>
      <PageHeader title="Ringkasan Inventory" sub={ctx.branch?.name ?? 'Semua cabang'} actions={<Link className="btn-ghost" href="/inventory/movements">Riwayat pergerakan</Link>} />
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <select name="cat" defaultValue={cat} className="input w-auto" aria-label="Kategori"><option value="">Semua kategori</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="btn-primary">Terapkan</button>
      </form>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total produk" value={nf(list.length)} hint={`${nf(stocked)} produk berstok`} />
        <Stat label="Total unit stok" value={nf(units)} hint="Tersedia untuk dijual" />
        <Stat label="Stok menipis" value={nf(low)} tone={low ? 'warn' : undefined} hint={<Link className="text-brand" href="/inventory/low">Lihat daftar</Link>} />
        <Stat label="Stok habis" value={nf(out)} tone={out ? 'bad' : undefined} hint={<Link className="text-brand" href="/inventory/low?status=habis">Lihat daftar</Link>} />
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Barang masuk (30 hari)" value={nf(sum(['receive', 'transfer_in']))} />
        <Stat label="Barang keluar (30 hari)" value={nf(sum(['issue']))} hint="Di luar penjualan" />
        <Stat label="Terjual (30 hari)" value={nf(sum(['sale']))} />
        <Stat label="Estimasi nilai persediaan" value={rupiah(value)} hint={noPrice ? `${noPrice} produk belum berharga tidak dihitung` : 'Berdasarkan harga jual'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Stok per cabang">
          {byBranch.size === 0 ? <Empty title="Belum ada data stok" /> : (
            <TableWrap><table className="tbl"><thead><tr><th>Cabang</th><th className="text-right">Unit tersedia</th><th className="text-right">Jenis produk</th></tr></thead><tbody>
              {ctx.scopeBranches.filter((b) => ids.includes(b.id)).map((b) => { const x = byBranch.get(b.id) ?? { avail: 0, products: 0 }; return (<tr key={b.id}><td>{b.name}</td><td className="text-right">{nf(x.avail)}</td><td className="text-right">{nf(x.products)}</td></tr>); })}
            </tbody></table></TableWrap>)}
        </Card>
        <Card title="Pergerakan stok terbaru" actions={<Link className="text-sm text-brand" href="/inventory/movements">Semua</Link>}>
          {recent.length === 0 ? <Empty title="Belum ada pergerakan" /> : (
            <TableWrap><table className="tbl"><thead><tr><th>Waktu</th><th>Produk</th><th>Jenis</th><th className="text-right">Jml</th></tr></thead><tbody>
              {recent.map((m) => (<tr key={m.id}><td className="whitespace-nowrap">{fdatetime(m.created_at)}</td><td>{m.products?.name}<div className="text-xs text-ink-500">{m.branches?.name}</div></td><td><Badge tone="info">{MOVEMENT[m.type] ?? m.type}</Badge></td><td className={`text-right font-medium ${m.qty < 0 ? 'text-bad' : 'text-ok'}`}>{m.qty > 0 ? '+' : ''}{m.qty}</td></tr>))}
            </tbody></table></TableWrap>)}
        </Card>
      </div>
    </>
  );
}
