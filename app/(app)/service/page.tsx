import Link from 'next/link';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { can } from '@/lib/permissions';
import { TICKET_STATUS, WARRANTY_STATE } from '@/lib/labels';
import { fdate, safeLike } from '@/lib/format';
import { Chip, DemoTag, Empty, PageHeader, Pagination, StatusBadge, TableWrap, one, pageNum } from '@/components/ui';

const PS = 25;
export default async function ServiceList({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage('service.view');
  const sp = await searchParams;
  const q = safeLike(one(sp.q) ?? ''), status = one(sp.status) ?? '', page = pageNum(sp.page);
  let uids: string[] = [];
  if (q) uids = (await run<{ id: string }[]>('cari unit', () => ctx.sb.from('inventory_units').select('id').in('branch_id', ctx.branchIds).or(`serial_number.ilike.%${q}%,internal_asset_code.ilike.%${q}%`).limit(100))).map((u) => u.id);
  let query = ctx.sb.from('service_tickets').select('id,ticket_no,category,status,received_at,eta,warranty_state,customers(name),inventory_units(internal_asset_code,serial_number),branches(name,is_demo),assignee:profiles!assigned_to(full_name)', { count: 'exact' })
    .eq('data_origin', ctx.scope).in('branch_id', ctx.branchIds).order('received_at', { ascending: false }).order('ticket_no', { ascending: false }).range((page - 1) * PS, page * PS - 1);
  if (q) query = query.or(`ticket_no.ilike.%${q}%${uids.length ? `,unit_id.in.(${uids.join(',')})` : ''}`);
  if (status === 'open') query = query.in('status', ['baru', 'diproses', 'menunggu_spare_part', 'menunggu_pelanggan']);
  else if (status) query = query.eq('status', status);
  const { data, count, error } = await query;
  if (error) throw Object.assign(new Error('Gagal memuat tiket'), { cause: error });
  const rows = (data ?? []) as unknown as { id: string; ticket_no: string; category: string; status: string; received_at: string; eta: string | null; warranty_state: string; customers: { name: string } | null; inventory_units: { internal_asset_code: string; serial_number: string | null } | null; branches: { name: string; is_demo: boolean } | null; assignee: { full_name: string } | null }[];
  return (
    <>
      <PageHeader title="Customer service" actions={can(ctx.role, 'service.create') && <Link className="btn-primary" href="/service/new">Tiket baru</Link>} />
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <input className="input w-64" name="q" defaultValue={q} placeholder="No. tiket / nomor seri / kode unit" aria-label="Cari" />
        <select className="input w-auto" name="status" defaultValue={status} aria-label="Status"><option value="">Semua status</option><option value="open">Masih terbuka</option>{Object.entries(TICKET_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="btn-primary">Terapkan</button>
      </form>
      {rows.length === 0 ? <Empty title="Belum ada tiket" /> : (
        <TableWrap><table className="tbl"><thead><tr><th>Tiket</th><th>Masuk</th><th>Cabang</th><th>Pelanggan</th><th>Unit</th><th>Keluhan</th><th>Status</th><th>Garansi</th><th>PIC</th></tr></thead><tbody>
          {rows.map((t) => (<tr key={t.id}>
            <td><Link className="text-brand underline" href={`/service/${t.id}`}><Chip>{t.ticket_no}</Chip></Link></td><td>{fdate(t.received_at)}</td><td>{t.branches?.name} {t.branches?.is_demo && <DemoTag />}</td><td>{t.customers?.name ?? '-'}</td>
            <td>{t.inventory_units ? <><Chip>{t.inventory_units.internal_asset_code}</Chip>{t.inventory_units.serial_number && <div className="mt-0.5"><Chip>SN {t.inventory_units.serial_number}</Chip></div>}</> : '-'}</td>
            <td>{t.category}</td><td><StatusBadge map={TICKET_STATUS} value={t.status} /></td><td><StatusBadge map={WARRANTY_STATE} value={t.warranty_state} /></td><td>{t.assignee?.full_name ?? '-'}</td></tr>))}
        </tbody></table></TableWrap>)}
      <Pagination page={page} pageSize={PS} total={count ?? 0} basePath="/service" params={{ q, status }} />
    </>
  );
}
