import Link from 'next/link';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { can } from '@/lib/permissions';
import { TRANSFER_STATUS } from '@/lib/labels';
import { fdatetime, nf } from '@/lib/format';
import { Card, Chip, Empty, Field, PageHeader, StatusBadge, TableWrap, one } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { cancelTransferAction, createTransferAction, receiveTransferAction } from '../actions';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function Transfers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage('inventory.view');
  const sp = await searchParams;
  const write = can(ctx.role, 'inventory.write');
  const sb = ctx.sb;
  const from = ctx.scopeBranches.find((b) => b.id === one(sp.from)) ?? null;
  const [list, avail, bal] = await Promise.all([
    run<Row[]>('transfer', () => sb.from('stock_transfers').select('id,number,status,note,created_at,received_at,from_branch_id,to_branch_id,fb:branches!stock_transfers_from_branch_id_fkey(name),tb:branches!stock_transfers_to_branch_id_fkey(name),stock_transfer_items(qty,products(name),inventory_units(internal_asset_code))').eq('data_origin', ctx.scope).order('created_at', { ascending: false }).limit(50)),
    from ? run<Row[]>('unit tersedia', () => sb.from('inventory_units').select('id,product_id,internal_asset_code,serial_number,products(name)').eq('branch_id', from.id).eq('status', 'available').eq('archived', false).order('internal_asset_code').limit(300)) : [],
    from ? run<Row[]>('saldo', () => sb.from('inventory_balances').select('product_id,qty,products(name)').eq('branch_id', from.id).gt('qty', 0)) : [],
  ]);
  const myIds = new Set(ctx.branches.map((b) => b.id));
  return (
    <>
      <PageHeader title="Transfer antar-cabang" sub="Stok keluar dari cabang asal saat transfer dibuat dan baru masuk cabang tujuan saat diterima." actions={<Link href="/inventory" className="btn-ghost">Kembali</Link>} />
      {write && (
        <Card title="Buat transfer" className="mb-4">
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <Field label="Cabang asal"><select name="from" className="input" defaultValue={from?.id ?? ''}><option value="" disabled>Pilih…</option>{ctx.scopeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <button className="btn-ghost">Tampilkan stok</button>
          </form>
          {from && (
            <ActionForm action={createTransferAction} resetOnSuccess className="space-y-4">
              <input type="hidden" name="from" value={from.id} />
              <Field label="Cabang tujuan"><select name="to" required className="input" defaultValue=""><option value="" disabled>Pilih…</option>{ctx.scopeBranches.filter((b) => b.id !== from.id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
              <div>
                <div className="label">Unit berseri tersedia di {from.name} ({avail.length})</div>
                {avail.length === 0 ? <p className="text-sm text-ink-500">Tidak ada unit tersedia.</p> : (
                  <div className="grid max-h-64 gap-1 overflow-y-auto rounded border border-ink-300/50 p-2 text-sm sm:grid-cols-2">{avail.map((u) => (
                    <label key={u.id} className="flex items-center gap-2"><input type="checkbox" name="unit" value={`${u.product_id}:${u.id}`} /><Chip>{u.internal_asset_code}</Chip><span className="truncate">{u.products?.name}</span></label>))}</div>)}
              </div>
              {bal.length > 0 && (<div><div className="label">Aksesori (jumlah yang dikirim)</div><div className="grid gap-2 sm:grid-cols-2">{bal.map((b) => (
                <label key={b.product_id} className="flex items-center gap-2 text-sm"><input className="input w-20" type="number" min={0} max={b.qty} name={`qty_${b.product_id}`} /> {b.products?.name} <span className="text-ink-500">(tersedia {nf(b.qty)})</span></label>))}</div></div>)}
              <Field label="Catatan"><input className="input" name="note" /></Field>
              <SubmitButton confirm="Buat transfer sekarang? Stok cabang asal langsung berkurang.">Buat transfer</SubmitButton>
            </ActionForm>)}
        </Card>)}
      {list.length === 0 ? <Empty title="Belum ada transfer" /> : (
        <TableWrap><table className="tbl"><thead><tr><th>Nomor</th><th>Dari → Ke</th><th>Isi</th><th>Status</th><th>Dibuat</th><th></th></tr></thead><tbody>
          {list.map((t) => (<tr key={t.id}>
            <td><Chip>{t.number}</Chip></td><td>{t.fb?.name ?? 'cabang lain'} → {t.tb?.name ?? 'cabang lain'}</td>
            <td className="text-xs">{(t.stock_transfer_items as Row[]).map((i, k) => <div key={k}>{i.inventory_units?.internal_asset_code ?? `${i.qty}×`} {i.products?.name}</div>)}</td>
            <td><StatusBadge map={TRANSFER_STATUS} value={t.status} /></td><td>{fdatetime(t.created_at)}</td>
            <td>{write && t.status === 'in_transit' && (<div className="flex flex-col gap-1">
              {myIds.has(t.to_branch_id) && <ActionForm action={receiveTransferAction}><input type="hidden" name="id" value={t.id} /><SubmitButton confirm="Barang sudah diterima fisik?">Terima</SubmitButton></ActionForm>}
              {myIds.has(t.from_branch_id) && <ActionForm action={cancelTransferAction} className="flex gap-1"><input type="hidden" name="id" value={t.id} /><input className="input w-32 py-1" name="reason" placeholder="Alasan batal" required minLength={3} /><SubmitButton className="btn-ghost" confirm="Batalkan transfer?">Batal</SubmitButton></ActionForm>}
            </div>)}</td>
          </tr>))}
        </tbody></table></TableWrap>)}
    </>
  );
}
