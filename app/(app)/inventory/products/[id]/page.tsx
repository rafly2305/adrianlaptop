import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { can } from '@/lib/permissions';
import { UNIT_STATUS } from '@/lib/labels';
import { nf } from '@/lib/format';
import { Card, Chip, Empty, Field, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { ProductForm } from '@/components/ProductForm';
import { adjustQtyAction, archiveProductAction, receiveQtyAction } from '../../actions';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requirePage('inventory.view');
  const sb = ctx.sb, write = can(ctx.role, 'inventory.write');
  const p = await run<Row | null>('produk', () => sb.from('products').select('*').eq('id', id).maybeSingle());
  if (!p) notFound();
  const [cats, stock, units] = await Promise.all([
    run<{ id: string; name: string }[]>('kategori', () => sb.from('categories').select('id,name').order('name')),
    run<{ branch_id: string; available: number; total: number }[]>('stok produk', () => sb.from('product_stock').select('branch_id,available,total').eq('product_id', id).in('branch_id', ctx.scopeBranches.map((b) => b.id))),
    p.tracking === 'serialized' ? run<Row[]>('unit produk', () => sb.from('inventory_units').select('id,internal_asset_code,serial_number,status,branches(name)').eq('product_id', id).eq('data_origin', ctx.scope).in('branch_id', ctx.branchIds).order('internal_asset_code').limit(200)) : [],
  ]);
  const sm = new Map(stock.map((s) => [s.branch_id, s]));
  return (
    <>
      <PageHeader title={p.name} sub={<Chip>{p.sku}</Chip>} actions={<Link className="btn-ghost" href="/inventory?view=products">Kembali</Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Stok per cabang" className="lg:col-span-1">
          <ul className="space-y-1 text-sm">{ctx.scopeBranches.map((b) => (<li key={b.id} className="flex justify-between"><span>{b.name}</span><span><b>{nf(sm.get(b.id)?.available ?? 0)}</b> tersedia / {nf(sm.get(b.id)?.total ?? 0)}</span></li>))}</ul>
        </Card>
        {write && p.tracking === 'quantity' && (<>
          <Card title="Tambah stok">
            <ActionForm action={receiveQtyAction} resetOnSuccess className="space-y-3">
              <input type="hidden" name="product_id" value={p.id} />
              <Field label="Cabang"><select className="input" name="branch_id" required defaultValue={ctx.branch?.id ?? ctx.scopeBranches[0]?.id}>{ctx.scopeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
              <Field label="Jumlah"><input className="input" name="qty" type="number" min={1} required /></Field>
              <Field label="Keterangan"><input className="input" name="reason" /></Field>
              <SubmitButton>Tambah</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Penyesuaian stok">
            <ActionForm action={adjustQtyAction} resetOnSuccess className="space-y-3">
              <input type="hidden" name="product_id" value={p.id} />
              <Field label="Cabang"><select className="input" name="branch_id" required defaultValue={ctx.branch?.id ?? ctx.scopeBranches[0]?.id}>{ctx.scopeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
              <Field label="Selisih (+/-)" hint="Contoh: -2 bila hilang/rusak. Stok tidak boleh jadi negatif."><input className="input" name="delta" type="number" required /></Field>
              <Field label="Alasan (wajib)"><input className="input" name="reason" required minLength={3} /></Field>
              <SubmitButton confirm="Simpan penyesuaian stok?">Sesuaikan</SubmitButton>
            </ActionForm>
          </Card>
        </>)}
        {p.tracking === 'serialized' && (
          <Card title={`Unit (${units.length})`} className="lg:col-span-2">
            {units.length === 0 ? <Empty title="Belum ada unit pada cakupan ini" /> : (
              <TableWrap><table className="tbl"><thead><tr><th>Kode</th><th>Nomor seri</th><th>Cabang</th><th>Status</th></tr></thead><tbody>{units.map((u) => (
                <tr key={u.id}><td><Link className="text-brand underline" href={`/inventory/units/${u.id}`}><Chip>{u.internal_asset_code}</Chip></Link></td><td>{u.serial_number ? <Chip>{u.serial_number}</Chip> : <span className="text-xs text-warn">belum ada</span>}</td><td>{u.branches?.name}</td><td><StatusBadge map={UNIT_STATUS} value={u.status} /></td></tr>))}</tbody></table></TableWrap>)}
          </Card>)}
      </div>
      {write && (<>
        <Card title="Ubah produk" className="mt-4"><ProductForm product={p} categories={cats} /></Card>
        <Card title={p.archived ? 'Produk diarsipkan' : 'Arsipkan produk'} className="mt-4">
          <ActionForm action={archiveProductAction} className="flex items-center gap-3">
            <input type="hidden" name="id" value={p.id} /><input type="hidden" name="archive" value={p.archived ? '0' : '1'} />
            <SubmitButton className="btn-ghost" confirm={p.archived ? 'Aktifkan kembali?' : 'Arsipkan produk ini? Riwayat tetap tersimpan.'}>{p.archived ? 'Aktifkan kembali' : 'Arsipkan'}</SubmitButton>
            <span className="text-xs text-ink-500">Produk tidak dihapus permanen agar riwayat transaksi tetap utuh.</span>
          </ActionForm>
        </Card>
      </>)}
    </>
  );
}
