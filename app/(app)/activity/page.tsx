import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { addDays, endOfDay, fdatetime, isYmd, safeLike, startOfDay, ymdWIB } from '@/lib/format';
import { ALL_TYPES, MODULES, MODULE_FILTER, MODULE_FILTER_LABEL, TYPE_LABEL, TYPE_TONE, actionsOfType, describe, referenceOf, typeOf } from '@/lib/activity-labels';
import { Badge, Chip, Empty, PageHeader, Pagination, TableWrap, one, pageNum } from '@/components/ui';

const PS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = { id: number; at: string; action: string; entity: string | null; detail: Record<string, unknown> | null; actor_id: string | null; profiles: { full_name: string } | null };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage('audit.view');
  const sp = await searchParams;
  const to = isYmd(sp.to) ? sp.to : ymdWIB();
  const from = isYmd(sp.from) ? sp.from : addDays(to, -29);
  const q = safeLike(one(sp.q) ?? ''), user = one(sp.user) ?? '', type = one(sp.type) ?? '', mod = one(sp.module) ?? '', page = pageNum(sp.page);

  const users = await run<{ id: string; full_name: string }[]>('daftar user', () => ctx.sb.from('profiles').select('id,full_name').order('full_name'));

  let query = ctx.sb.from('audit_logs').select('id,at,action,entity,detail,actor_id,profiles:actor_id(full_name)', { count: 'exact' })
    .gte('at', startOfDay(from)).lte('at', endOfDay(to)).order('at', { ascending: false }).range((page - 1) * PS, page * PS - 1);
  if (UUID.test(user)) query = query.eq('actor_id', user);
  if ((ALL_TYPES as string[]).includes(type)) query = query.in('action', actionsOfType(type));
  if (MODULE_FILTER[mod]) query = query.in('entity', MODULE_FILTER[mod]);
  if (q) {
    const ids = users.filter((u) => u.full_name.toLowerCase().includes(q.toLowerCase())).map((u) => u.id);
    const parts = ['invoice', 'number', 'no', 'code', 'email'].map((k) => `detail->>${k}.ilike.%${q}%`);
    if (ids.length) parts.push(`actor_id.in.(${ids.join(',')})`);
    query = query.or(parts.join(','));
  }
  const { data, count, error } = await query;
  if (error) throw Object.assign(new Error('Gagal memuat activity log'), { cause: error });
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="Activity Log" sub="Riwayat aktivitas pengguna. Tercatat otomatis dari seluruh modul." />
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <input className="input w-56" name="q" defaultValue={q} placeholder="Nama user / referensi" aria-label="Cari" />
        <select className="input w-auto" name="user" defaultValue={user} aria-label="User"><option value="">Semua user</option>{users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
        <select className="input w-auto" name="type" defaultValue={type} aria-label="Jenis aktivitas"><option value="">Semua aktivitas</option>{ALL_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
        <select className="input w-auto" name="module" defaultValue={mod} aria-label="Modul"><option value="">Semua modul</option>{Object.entries(MODULE_FILTER_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className="input w-auto" type="date" name="from" defaultValue={from} aria-label="Dari" /><input className="input w-auto" type="date" name="to" defaultValue={to} aria-label="Sampai" />
        <button className="btn-primary">Terapkan</button>
      </form>
      {rows.length === 0 ? <Empty title="Belum ada aktivitas pada filter ini" /> : (
        <TableWrap><table className="tbl"><thead><tr><th>Waktu</th><th>User</th><th>Aktivitas</th><th>Modul</th><th>Referensi</th><th>Keterangan</th></tr></thead><tbody>
          {rows.map((r) => {
            const d = r.detail ?? {}; const t = typeOf(r.action); const ref = referenceOf(r.action, d);
            return (<tr key={r.id}>
              <td className="whitespace-nowrap">{fdatetime(r.at)}</td>
              <td>{r.profiles?.full_name ?? 'Sistem'}</td>
              <td><Badge tone={TYPE_TONE[t]}>{TYPE_LABEL[t]}</Badge></td>
              <td>{MODULES[r.entity ?? ''] ?? r.entity ?? '-'}</td>
              <td>{ref ? <Chip>{ref}</Chip> : <span className="text-ink-500">-</span>}</td>
              <td className="max-w-md">{describe(r.action, r.entity, d)}</td>
            </tr>);
          })}
        </tbody></table></TableWrap>)}
      <Pagination page={page} pageSize={PS} total={count ?? 0} basePath="/activity" params={{ q, user, type, module: mod, from, to }} />
    </>
  );
}
