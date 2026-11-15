import Link from 'next/link';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { OPNAME_STATUS } from '@/lib/labels';
import { fdatetime } from '@/lib/format';
import { Card, Chip, Empty, Field, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { createOpnameAction } from './actions';

type O = { id: string; number: string; status: string; note: string | null; created_at: string; confirmed_at: string | null; branches: { name: string } | null; profiles: { full_name: string } | null };

export default async function OpnameList() {
  const ctx = await requirePage('inventory.write');
  const list = await run<O[]>('opname', () => ctx.sb.from('stock_opnames').select('id,number,status,note,created_at,confirmed_at,branches(name),profiles:created_by(full_name)').in('branch_id', ctx.branchIds).order('created_at', { ascending: false }).limit(100));
  return (
    <>
      <PageHeader title="Stok Opname" sub="Cocokkan stok sistem dengan stok fisik di toko. Penyesuaian hanya berlaku setelah dikonfirmasi dan selalu tercatat di riwayat." />
      <Card title="Mulai stok opname baru" className="mb-4">
        <ActionForm action={createOpnameAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="branch_id" value={ctx.branch?.id ?? ''} /><Field label="Lokasi"><div className="input bg-canvas text-ink-500" aria-readonly>{ctx.branch?.name ?? 'Cidodol'}</div></Field>
          <Field label="Catatan (opsional)"><input className="input w-64" name="note" maxLength={300} /></Field>
          <SubmitButton>Mulai opname</SubmitButton>
        </ActionForm>
      </Card>
      {list.length === 0 ? <Empty title="Belum ada stok opname" /> : (
        <TableWrap><table className="tbl"><thead><tr><th>Nomor</th><th>Status</th><th>Dibuat</th><th>Oleh</th><th>Selesai</th><th></th></tr></thead><tbody>
          {list.map((o) => (<tr key={o.id}><td><Chip>{o.number}</Chip></td><td><StatusBadge map={OPNAME_STATUS} value={o.status} /></td><td>{fdatetime(o.created_at)}</td><td>{o.profiles?.full_name ?? '-'}</td><td>{o.confirmed_at ? fdatetime(o.confirmed_at) : '-'}</td><td><Link className="btn-ghost py-1" href={`/inventory/opname/${o.id}`}>{o.status === 'draft' ? 'Lanjutkan' : 'Lihat'}</Link></td></tr>))}
        </tbody></table></TableWrap>)}
    </>
  );
}
