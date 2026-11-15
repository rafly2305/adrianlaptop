import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { can } from '@/lib/permissions';
import { nf } from '@/lib/format';
import { Badge, Card, Empty, Field, PageHeader, TableWrap, one } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { setMinStockAction } from '../stock-actions';

type P = { id: string; sku: string; name: string; min_stock: number | null; category_id: string | null };
type S = { product_id: string; branch_id: string; available: number };

export default async function LowStock({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage('inventory.view');
  const sp = await searchParams;
  const cat = one(sp.cat) ?? '', statusF = one(sp.status) ?? '';
  const write = can(ctx.role, 'inventory.write');
  const [cats, prods, stock] = await Promise.all([
    run<{ id: string; name: string }[]>('kategori', () => ctx.sb.from('categories').select('id,name').order('name')),
    run<P[]>('produk', () => ctx.sb.from('products').select('id,sku,name,min_stock,category_id').eq('archived', false).order('name').limit(2000)),
    run<S[]>('stok', () => ctx.sb.from('product_stock').select('product_id,branch_id,available').in('branch_id', ctx.branchIds).limit(20000)),
  ]);
  const pmap = new Map(prods.map((p) => [p.id, p]));
  const bname = new Map(ctx.scopeBranches.map((b) => [b.id, b.name]));
  const rows = stock.map((s) => ({ s, p: pmap.get(s.product_id) })).filter((x) => x.p && x.p.min_stock != null && x.s.available <= (x.p.min_stock as number) && (!cat || x.p.category_id === cat))
    .map((x) => ({ p: x.p as P, branch: bname.get(x.s.branch_id) ?? '-', cur: x.s.available, min: (x.p as P).min_stock as number }))
    .filter((r) => (statusF === 'habis' ? r.cur === 0 : statusF === 'menipis' ? r.cur > 0 : true))
    .sort((a, b) => a.cur - b.cur || a.p.name.localeCompare(b.p.name));
  const total = new Map<string, number>();
  stock.forEach((s) => total.set(s.product_id, (total.get(s.product_id) ?? 0) + s.available));
  return (
    <>
      <PageHeader title="Stok Menipis" sub="Produk yang stoknya sudah mencapai batas minimum atau habis." />
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <select name="cat" defaultValue={cat} className="input w-auto" aria-label="Kategori"><option value="">Semua kategori</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="status" defaultValue={statusF} className="input w-auto" aria-label="Status"><option value="">Menipis & habis</option><option value="menipis">Menipis</option><option value="habis">Habis</option></select>
        <button className="btn-primary">Terapkan</button>
      </form>
      {rows.length === 0 ? <Empty title="Tidak ada produk yang stoknya menipis" hint="Atur batas minimal stok di bagian bawah halaman ini agar peringatan muncul." /> : (
        <TableWrap><table className="tbl"><thead><tr><th>Produk</th><th>SKU</th><th className="text-right">Stok</th><th className="text-right">Minimum</th><th>Status</th><th className="w-40">Indikator</th></tr></thead><tbody>
          {rows.map((r, i) => (<tr key={i}>
            <td>{r.p.name}</td><td><span className="chip">{r.p.sku}</span></td>
            <td className="text-right font-medium">{nf(r.cur)}</td><td className="text-right">{nf(r.min)}</td>
            <td>{r.cur === 0 ? <Badge tone="bad">Habis</Badge> : <Badge tone="warn">Menipis</Badge>}</td>
            <td><div className="h-2 w-full rounded bg-canvas"><div className={`h-2 rounded ${r.cur === 0 ? 'bg-bad' : 'bg-warn'}`} style={{ width: `${Math.min(100, r.min > 0 ? Math.round((r.cur / r.min) * 100) : 0)}%` }} /></div></td>
          </tr>))}
        </tbody></table></TableWrap>)}
      {write && (
        <details className="card mt-6">
          <summary className="cursor-pointer px-4 py-3 font-semibold">Atur batas minimal stok per produk</summary>
          <div className="space-y-1 border-t border-ink-300/40 p-4">
            {prods.map((p) => (
              <ActionForm key={p.id} action={setMinStockAction} className="flex flex-wrap items-center gap-2 text-sm">
                <input type="hidden" name="product_id" value={p.id} />
                <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-ink-500">· stok {nf(total.get(p.id) ?? 0)}</span></span>
                <input className="input w-24 py-1" type="number" min={0} name="min_stock" defaultValue={p.min_stock ?? ''} placeholder="min." aria-label={`Minimum ${p.name}`} />
                <SubmitButton className="btn-ghost py-1">Simpan</SubmitButton>
              </ActionForm>
            ))}
          </div>
        </details>)}
    </>
  );
}
