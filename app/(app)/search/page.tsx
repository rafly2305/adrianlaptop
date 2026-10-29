import Link from 'next/link';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { can } from '@/lib/permissions';
import { safeLike } from '@/lib/format';
import { Card, Chip, Empty, PageHeader, one } from '@/components/ui';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage('dashboard.view');
  const q = safeLike(one((await searchParams).q) ?? '');
  if (q.length < 2) return (<><PageHeader title="Pencarian" /><Empty title="Ketik minimal 2 karakter di kolom pencarian" /></>);
  const sb = ctx.sb, ids = ctx.branchIds, scope = ctx.scope;
  const [units, prods, sales, tickets] = await Promise.all([
    can(ctx.role, 'inventory.view') ? run<Row[]>('cari unit', () => sb.from('inventory_units').select('id,internal_asset_code,serial_number,products(name)').eq('data_origin', scope).in('branch_id', ids).or(`serial_number.ilike.%${q}%,internal_asset_code.ilike.%${q}%`).limit(10)) : [],
    can(ctx.role, 'inventory.view') ? run<Row[]>('cari produk', () => sb.from('products').select('id,sku,name').or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%`).limit(10)) : [],
    can(ctx.role, 'sales.view') ? run<Row[]>('cari invoice', () => sb.from('sales').select('id,invoice_no,total').eq('data_origin', scope).in('branch_id', ids).ilike('invoice_no', `%${q}%`).limit(10)) : [],
    can(ctx.role, 'service.view') ? run<Row[]>('cari tiket', () => sb.from('service_tickets').select('id,ticket_no,category').eq('data_origin', scope).in('branch_id', ids).ilike('ticket_no', `%${q}%`).limit(10)) : [],
  ]);
  const none = !units.length && !prods.length && !sales.length && !tickets.length;
  return (
    <>
      <PageHeader title={`Hasil untuk “${q}”`} sub={`Cakupan: ${ctx.branch?.name ?? 'semua cabang'} · ${scope === 'demo' ? 'data demo' : 'data nyata'}`} />
      {none ? <Empty title="Tidak ada hasil" hint="Coba nomor seri lengkap, kode unit (UNIT-…), SKU, atau nomor invoice/tiket. Periksa juga pemilih cabang dan jenis data di header." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {units.length > 0 && <Card title="Unit / nomor seri"><ul className="space-y-1 text-sm">{units.map((u) => <li key={u.id}><Link className="text-brand underline" href={`/inventory/units/${u.id}`}><Chip>{u.internal_asset_code}</Chip></Link> {u.serial_number && <Chip>SN {u.serial_number}</Chip>} {u.products?.name}</li>)}</ul></Card>}
          {prods.length > 0 && <Card title="Produk"><ul className="space-y-1 text-sm">{prods.map((p) => <li key={p.id}><Link className="text-brand underline" href={`/inventory/products/${p.id}`}><Chip>{p.sku}</Chip></Link> {p.name}</li>)}</ul></Card>}
          {sales.length > 0 && <Card title="Transaksi"><ul className="space-y-1 text-sm">{sales.map((s) => <li key={s.id}><Link className="text-brand underline" href={`/sales/${s.id}`}><Chip>{s.invoice_no}</Chip></Link></li>)}</ul></Card>}
          {tickets.length > 0 && <Card title="Tiket layanan"><ul className="space-y-1 text-sm">{tickets.map((t) => <li key={t.id}><Link className="text-brand underline" href={`/service/${t.id}`}><Chip>{t.ticket_no}</Chip></Link> {t.category}</li>)}</ul></Card>}
        </div>)}
    </>
  );
}
