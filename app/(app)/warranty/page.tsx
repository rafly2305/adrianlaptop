import Link from 'next/link';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { can } from '@/lib/permissions';
import { fdate, safeLike, ymdWIB } from '@/lib/format';
import { Badge, Chip, Empty, PageHeader, TableWrap, one } from '@/components/ui';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function WarrantyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage('service.view');
  const sp = await searchParams;
  const q = safeLike(one(sp.q) ?? '');
  let query = ctx.sb.from('warranties').select('id,kind,start_date,end_date,verified,voided,inventory_units!inner(id,internal_asset_code,serial_number,branch_id,products(name)),sales(invoice_no,id)')
    .eq('data_origin', ctx.scope).in('inventory_units.branch_id', ctx.branchIds).order('end_date').limit(200);
  if (q) query = query.or(`serial_number.ilike.%${q}%,internal_asset_code.ilike.%${q}%`, { referencedTable: 'inventory_units' });
  const { data, error } = await query;
  if (error) throw Object.assign(new Error('Gagal memuat garansi'), { cause: error });
  const today = ymdWIB();
  const rows = (data ?? []) as Row[];
  const state = (w: Row): [string, 'ok' | 'bad' | 'warn' | 'mute'] => w.voided ? ['Dibatalkan', 'mute'] : !w.verified ? ['Belum diverifikasi', 'warn'] : w.end_date < today ? ['Berakhir', 'bad'] : ['Aktif', 'ok'];
  return (
    <>
      <PageHeader title="Garansi" sub="Dihitung dari data garansi yang tercatat per unit. Unit tanpa data garansi dianggap belum diverifikasi." />
      <form className="mb-4 flex gap-2" method="get"><input className="input w-72" name="q" defaultValue={q} placeholder="Cari nomor seri / kode unit" aria-label="Cari" /><button className="btn-primary">Cari</button></form>
      {rows.length === 0 ? <Empty title="Belum ada data garansi" hint="Data garansi toko dibuat otomatis saat unit terjual, jika masa garansi diatur (Pengaturan atau per unit). Aturan masa garansi belum ditetapkan di sistem ini sampai pemilik mengisinya." /> : (
        <TableWrap><table className="tbl"><thead><tr><th>Unit</th><th>Produk</th><th>Jenis</th><th>Mulai</th><th>Berakhir</th><th>Status</th><th>Transaksi</th><th></th></tr></thead><tbody>
          {rows.map((w) => { const [l, t] = state(w); return (<tr key={w.id}>
            <td><Link className="text-brand underline" href={`/inventory/units/${w.inventory_units.id}`}><Chip>{w.inventory_units.internal_asset_code}</Chip></Link>{w.inventory_units.serial_number && <div className="mt-0.5"><Chip>SN {w.inventory_units.serial_number}</Chip></div>}</td>
            <td>{w.inventory_units.products?.name}</td><td>{w.kind === 'toko' ? 'Toko' : 'Produsen'}</td><td>{fdate(w.start_date)}</td><td>{fdate(w.end_date)}</td><td><Badge tone={t}>{l}</Badge></td>
            <td>{w.sales ? <Link className="text-brand underline" href={`/sales/${w.sales.id}`}>{w.sales.invoice_no}</Link> : '-'}</td>
            <td>{can(ctx.role, 'service.create') && <Link className="btn-ghost py-1" href={`/service/new?unit=${w.inventory_units.serial_number ?? w.inventory_units.internal_asset_code}`}>Klaim</Link>}</td></tr>); })}
        </tbody></table></TableWrap>)}
    </>
  );
}
