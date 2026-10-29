import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { can } from '@/lib/permissions';
import { CONDITION, MOVEMENT, SERIAL_STATUS, UNIT_STATUS } from '@/lib/labels';
import { fdate, fdatetime, nf, safeLike } from '@/lib/format';
import { Badge, Chip, DemoTag, Empty, Pagination, PageHeader, StatusBadge, TableWrap, one, pageNum } from '@/components/ui';
import { PrintButton } from '@/components/PrintButton';

type SP = Promise<Record<string, string | string[] | undefined>>;
const PS = 25;
const VIEWS = [['units', 'Unit'], ['products', 'Produk'], ['low', 'Stok menipis'], ['movements', 'Riwayat stok'], ['transfers', 'Transfer']] as const;

export default async function InventoryPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage('inventory.view');
  const sp = await searchParams;
  const view = (VIEWS.map((v) => v[0]) as string[]).includes(one(sp.view) ?? '') ? (one(sp.view) as string) : 'units';
  const q = safeLike(one(sp.q) ?? ''), status = one(sp.status) ?? '', cond = one(sp.cond) ?? '', cat = one(sp.cat) ?? '', page = pageNum(sp.page);
  const from = (page - 1) * PS, to = from + PS - 1;
  const sb = ctx.sb, ids = ctx.branchIds, scope = ctx.scope;
  const write = can(ctx.role, 'inventory.write');
  const cats = await run<{ id: string; name: string }[]>('kategori', () => sb.from('categories').select('id,name').order('name'));
  const params = { view, q, status, cond, cat };

  let body: React.ReactNode = null;

  if (view === 'units') {
    let pids: string[] = [];
    if (q) pids = (await run<{ id: string }[]>('cari produk', () => sb.from('products').select('id').or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%`).limit(300))).map((p) => p.id);
    let query = sb.from('inventory_units')
      .select('id,internal_asset_code,serial_number,serial_status,status,condition,received_at,branches(name,is_demo),products!inner(sku,name,category_id,needs_verification)', { count: 'exact' })
      .eq('data_origin', scope).in('branch_id', ids).order('internal_asset_code').range(from, to);
    if (q) query = query.or(`serial_number.ilike.%${q}%,internal_asset_code.ilike.%${q}%${pids.length ? `,product_id.in.(${pids.join(',')})` : ''}`);
    if (status) query = query.eq('status', status); else query = query.eq('archived', false);
    if (cond) query = query.eq('condition', cond);
    if (cat) query = query.eq('products.category_id', cat);
    const { data, count, error } = await query;
    if (error) throw Object.assign(new Error('Gagal memuat unit'), { cause: error });
    const rows = (data ?? []) as unknown as { id: string; internal_asset_code: string; serial_number: string | null; serial_status: string; status: string; condition: string; received_at: string | null; branches: { name: string; is_demo: boolean } | null; products: { sku: string; name: string; needs_verification: boolean } | null }[];
    body = (<>
      {rows.length === 0 ? <Empty title="Tidak ada unit yang cocok" hint="Ubah filter atau pencarian." /> : (
        <TableWrap><table className="tbl"><thead><tr><th>Kode unit</th><th>Nomor seri</th><th>Produk</th><th>Cabang</th><th>Status</th><th>Kondisi</th><th>Masuk</th></tr></thead><tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td><Link href={`/inventory/units/${u.id}`} className="text-brand underline"><Chip>{u.internal_asset_code}</Chip></Link></td>
              <td>{u.serial_number ? <><Chip>{u.serial_number}</Chip> <StatusBadge map={SERIAL_STATUS} value={u.serial_status} /></> : <span className="text-warn text-xs">belum ada nomor seri</span>}</td>
              <td><div>{u.products?.name}</div><div className="text-xs text-ink-500">{u.products?.sku}{u.products?.needs_verification && ' · spesifikasi perlu verifikasi'}</div></td>
              <td>{u.branches?.name} {u.branches?.is_demo && <DemoTag />}</td>
              <td><StatusBadge map={UNIT_STATUS} value={u.status} /></td>
              <td>{CONDITION[u.condition] ?? u.condition}</td><td>{fdate(u.received_at)}</td>
            </tr>))}
        </tbody></table></TableWrap>)}
      <Pagination page={page} pageSize={PS} total={count ?? 0} basePath="/inventory" params={params} />
    </>);
  }

  if (view === 'products' || view === 'low') {
    let query = sb.from('products').select('id,sku,name,brand,tracking,min_stock,needs_verification,archived,categories(name)', { count: 'exact' }).order('sku');
    if (view === 'low') query = query.eq('archived', false).not('min_stock', 'is', null).limit(1000); else query = query.range(from, to).eq('archived', status === 'archived');
    if (q && view === 'products') query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%`);
    if (cat && view === 'products') query = query.eq('category_id', cat);
    const { data, count, error } = await query;
    if (error) throw Object.assign(new Error('Gagal memuat produk'), { cause: error });
    const prods = (data ?? []) as unknown as { id: string; sku: string; name: string; brand: string | null; tracking: string; min_stock: number | null; needs_verification: boolean; archived: boolean; categories: { name: string } | null }[];
    const st = prods.length ? await run<{ product_id: string; available: number; total: number }[]>('stok', () => sb.from('product_stock').select('product_id,available,total').in('branch_id', ids).in('product_id', prods.map((p) => p.id))) : [];
    const agg = new Map<string, { a: number; t: number }>();
    st.forEach((s) => { const x = agg.get(s.product_id) ?? { a: 0, t: 0 }; x.a += s.available; x.t += s.total; agg.set(s.product_id, x); });
    const list = view === 'low' ? prods.filter((p) => (agg.get(p.id)?.a ?? 0) <= (p.min_stock ?? -1)) : prods;
    body = (<>
      {list.length === 0 ? <Empty title={view === 'low' ? 'Tidak ada produk dengan stok menipis' : 'Tidak ada produk'} hint={view === 'low' ? 'Peringatan hanya berlaku untuk produk yang sudah diberi batas stok minimal.' : undefined} /> : (
        <TableWrap><table className="tbl"><thead><tr><th>SKU</th><th>Produk</th><th>Kategori</th><th>Pengelolaan</th><th className="text-right">Tersedia</th><th className="text-right">Total</th><th className="text-right">Minimal</th></tr></thead><tbody>
          {list.map((p) => { const a = agg.get(p.id); const low = p.min_stock != null && (a?.a ?? 0) <= p.min_stock; return (
            <tr key={p.id}>
              <td><Chip>{p.sku}</Chip></td>
              <td><Link className="text-brand underline" href={`/inventory/products/${p.id}`}>{p.name}</Link>{p.needs_verification && <div className="text-xs text-warn">perlu verifikasi spesifikasi</div>}{p.archived && <Badge>Arsip</Badge>}</td>
              <td>{p.categories?.name ?? '-'}</td><td>{p.tracking === 'serialized' ? 'Berseri' : 'Kuantitas'}</td>
              <td className={`text-right font-medium ${low ? 'text-warn' : ''}`}>{nf(a?.a ?? 0)}</td><td className="text-right">{nf(a?.t ?? 0)}</td><td className="text-right">{p.min_stock ?? '—'}</td>
            </tr>); })}
        </tbody></table></TableWrap>)}
      {view === 'products' && <Pagination page={page} pageSize={PS} total={count ?? 0} basePath="/inventory" params={params} />}
    </>);
  }

  if (view === 'movements') {
    const { data, count, error } = await sb.from('stock_movements').select('id,type,qty,reason,created_at,products(name),branches(name),inventory_units(internal_asset_code),profiles(full_name)', { count: 'exact' })
      .eq('data_origin', scope).in('branch_id', ids).order('created_at', { ascending: false }).range(from, to);
    if (error) throw Object.assign(new Error('Gagal memuat riwayat'), { cause: error });
    const rows = (data ?? []) as unknown as { id: string; type: string; qty: number; reason: string | null; created_at: string; products: { name: string } | null; branches: { name: string } | null; inventory_units: { internal_asset_code: string } | null; profiles: { full_name: string } | null }[];
    body = (<>
      {rows.length === 0 ? <Empty title="Belum ada pergerakan stok" /> : (
        <TableWrap><table className="tbl"><thead><tr><th>Waktu</th><th>Jenis</th><th>Produk</th><th>Unit</th><th>Cabang</th><th className="text-right">Jumlah</th><th>Keterangan</th><th>Oleh</th></tr></thead><tbody>
          {rows.map((m) => (<tr key={m.id}><td>{fdatetime(m.created_at)}</td><td>{MOVEMENT[m.type] ?? m.type}</td><td>{m.products?.name}</td><td>{m.inventory_units ? <Chip>{m.inventory_units.internal_asset_code}</Chip> : '-'}</td><td>{m.branches?.name}</td>
            <td className={`text-right ${m.qty < 0 ? 'text-bad' : m.qty > 0 ? 'text-ok' : ''}`}>{m.qty > 0 ? '+' : ''}{m.qty}</td><td className="max-w-xs truncate">{m.reason ?? '-'}</td><td>{m.profiles?.full_name ?? '—'}</td></tr>))}
        </tbody></table></TableWrap>)}
      <Pagination page={page} pageSize={PS} total={count ?? 0} basePath="/inventory" params={params} />
    </>);
  }

  if (view === 'transfers') {
    redirect('/inventory/transfers');
  }

  return (
    <>
      <PageHeader title="Inventory" sub={`${ctx.branch?.name ?? 'Semua cabang'} · ${scope === 'demo' ? 'data demo' : 'data nyata'}`}
        actions={<>
          {write && <Link className="btn-primary" href="/inventory/receive">Terima barang</Link>}
          {write && <Link className="btn-ghost" href="/inventory/products/new">Produk baru</Link>}
          {write && <Link className="btn-ghost" href="/inventory/import">Impor CSV</Link>}
          <a className="btn-ghost" href={`/api/export/inventory`}>Ekspor CSV</a>
          <PrintButton />
        </>} />
      <div className="no-print mb-4 flex flex-wrap gap-1 border-b border-ink-300/50">
        {VIEWS.map(([k, l]) => (<Link key={k} href={`/inventory?view=${k}`} className={`-mb-px border-b-2 px-3 py-2 text-sm ${view === k ? 'border-brand font-medium text-brand' : 'border-transparent text-ink-500 hover:text-ink'}`}>{l}</Link>))}
      </div>
      {(view === 'units' || view === 'products') && (
        <form className="no-print mb-4 flex flex-wrap items-end gap-2" method="get">
          <input type="hidden" name="view" value={view} />
          <input name="q" defaultValue={q} className="input w-64" placeholder="Nama, SKU, merek, model, nomor seri…" aria-label="Cari" />
          <select name="cat" defaultValue={cat} className="input w-auto" aria-label="Kategori"><option value="">Semua kategori</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          {view === 'units' && <>
            <select name="status" defaultValue={status} className="input w-auto" aria-label="Status"><option value="">Semua status aktif</option>{Object.entries(UNIT_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
            <select name="cond" defaultValue={cond} className="input w-auto" aria-label="Kondisi"><option value="">Semua kondisi</option>{Object.entries(CONDITION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></>}
          {view === 'products' && <select name="status" defaultValue={status} className="input w-auto" aria-label="Arsip"><option value="">Aktif</option><option value="archived">Diarsipkan</option></select>}
          <button className="btn-primary">Terapkan</button>
        </form>
      )}
      {body}
    </>
  );
}
