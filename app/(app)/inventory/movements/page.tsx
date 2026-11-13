import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { MOVEMENT } from '@/lib/labels';
import { addDays, endOfDay, fdatetime, isYmd, nf, safeLike, startOfDay, ymdWIB } from '@/lib/format';
import { Badge, Chip, Empty, PageHeader, Pagination, TableWrap, one, pageNum } from '@/components/ui';

const PS = 30;
type M = { id: string; created_at: string; type: string; qty: number; stock_before: number | null; stock_after: number | null; reason: string | null; ref_no: string | null; note: string | null; supplier: string | null;
  products: { name: string; sku: string } | null; branches: { name: string } | null; profiles: { full_name: string } | null; inventory_units: { internal_asset_code: string } | null };

export default async function Movements({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage('inventory.view');
  const sp = await searchParams;
  const to = isYmd(sp.to) ? sp.to : ymdWIB();
  const from = isYmd(sp.from) ? sp.from : addDays(to, -29);
  const q = safeLike(one(sp.q) ?? ''), type = one(sp.type) ?? '', page = pageNum(sp.page);
  let pids: string[] | null = null;
  if (q) pids = (await run<{ id: string }[]>('cari produk', () => ctx.sb.from('products').select('id').or(`name.ilike.%${q}%,sku.ilike.%${q}%`).limit(300))).map((p) => p.id);
  let query = ctx.sb.from('stock_movements').select('id,created_at,type,qty,stock_before,stock_after,reason,ref_no,note,supplier,products(name,sku),branches(name),profiles:actor_id(full_name),inventory_units(internal_asset_code)', { count: 'exact' })
    .in('branch_id', ctx.branchIds).gte('created_at', startOfDay(from)).lte('created_at', endOfDay(to)).order('created_at', { ascending: false }).range((page - 1) * PS, page * PS - 1);
  if (type && MOVEMENT[type]) query = query.eq('type', type);
  if (pids) query = pids.length ? query.in('product_id', pids) : query.eq('product_id', '00000000-0000-0000-0000-000000000000');
  const { data, count, error } = await query;
  if (error) throw Object.assign(new Error('Gagal memuat riwayat stok'), { cause: error });
  const rows = (data ?? []) as unknown as M[];
  return (
    <>
      <PageHeader title="Riwayat Pergerakan Stok" sub="Seluruh perubahan stok dapat ditelusuri: barang masuk/keluar, penjualan, retur, opname, dan transfer." />
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <input className="input w-56" name="q" defaultValue={q} placeholder="Nama / SKU produk" aria-label="Cari" />
        <select className="input w-auto" name="type" defaultValue={type} aria-label="Jenis"><option value="">Semua jenis</option>{Object.entries(MOVEMENT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className="input w-auto" type="date" name="from" defaultValue={from} aria-label="Dari" /><input className="input w-auto" type="date" name="to" defaultValue={to} aria-label="Sampai" />
        <button className="btn-primary">Terapkan</button>
      </form>
      {rows.length === 0 ? <Empty title="Tidak ada pergerakan pada filter ini" /> : (
        <TableWrap><table className="tbl"><thead><tr><th>Tanggal</th><th>Produk</th><th>Cabang</th><th>Jenis</th><th className="text-right">Perubahan</th><th className="text-right">Sebelum</th><th className="text-right">Sesudah</th><th>Referensi</th><th>Oleh</th></tr></thead><tbody>
          {rows.map((m) => (<tr key={m.id}>
            <td className="whitespace-nowrap">{fdatetime(m.created_at)}</td>
            <td>{m.products?.name}{m.inventory_units && <div><Chip>{m.inventory_units.internal_asset_code}</Chip></div>}</td>
            <td>{m.branches?.name}</td>
            <td><Badge tone="info">{MOVEMENT[m.type] ?? m.type}</Badge></td>
            <td className={`text-right font-medium ${m.qty < 0 ? 'text-bad' : m.qty > 0 ? 'text-ok' : ''}`}>{m.qty > 0 ? '+' : ''}{nf(m.qty)}</td>
            <td className="text-right">{m.stock_before == null ? '-' : nf(m.stock_before)}</td><td className="text-right">{m.stock_after == null ? '-' : nf(m.stock_after)}</td>
            <td className="max-w-xs text-xs">{m.ref_no && <div><Chip>{m.ref_no}</Chip></div>}<div>{m.reason}</div>{m.supplier && <div className="text-ink-500">Pemasok: {m.supplier}</div>}{m.note && <div className="text-ink-500">{m.note}</div>}</td>
            <td>{m.profiles?.full_name ?? '-'}</td>
          </tr>))}
        </tbody></table></TableWrap>)}
      <Pagination page={page} pageSize={PS} total={count ?? 0} basePath="/inventory/movements" params={{ q, type, from, to }} />
    </>
  );
}
