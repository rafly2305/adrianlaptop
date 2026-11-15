import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { ISSUE_REASONS } from '@/lib/labels';
import { fdatetime, nf, ymdWIB } from '@/lib/format';
import { Card, Chip, Empty, Field, PageHeader, TableWrap } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { issueStockAction } from '../stock-actions';

type U = { id: string; product_id: string; internal_asset_code: string; serial_number: string | null; products: { name: string } | null };
type B = { product_id: string; qty: number; products: { name: string; sku: string } | null };
type M = { id: string; created_at: string; qty: number; reason: string | null; ref_no: string | null; note: string | null; products: { name: string } | null; branches: { name: string } | null; profiles: { full_name: string } | null };

export default async function IssuePage() {
  const ctx = await requirePage('inventory.write');
  const branch = ctx.branch;
  const [units, bal, recent] = await Promise.all([
    branch ? run<U[]>('unit', () => ctx.sb.from('inventory_units').select('id,product_id,internal_asset_code,serial_number,products(name)').eq('branch_id', branch.id).eq('status', 'available').eq('archived', false).order('internal_asset_code').limit(500)) : [],
    branch ? run<B[]>('saldo', () => ctx.sb.from('inventory_balances').select('product_id,qty,products(name,sku)').eq('branch_id', branch.id).gt('qty', 0).limit(500)) : [],
    run<M[]>('riwayat keluar', () => ctx.sb.from('stock_movements').select('id,created_at,qty,reason,ref_no,note,products(name),branches(name),profiles:actor_id(full_name)').eq('type', 'issue').in('branch_id', ctx.branchIds).order('created_at', { ascending: false }).limit(20)),
  ]);
  const Common = () => (<>
    <Field label="Alasan"><select className="input" name="reason" required defaultValue="rusak">{Object.entries(ISSUE_REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    <Field label="Tanggal keluar"><input className="input" type="date" name="date" defaultValue={ymdWIB()} /></Field>
    <Field label="Keterangan" className="sm:col-span-2" hint="Wajib diisi bila alasan “Pengeluaran lainnya”."><input className="input" name="note" maxLength={300} /></Field>
  </>);
  return (
    <>
      <PageHeader title="Barang Keluar" sub="Pengeluaran stok di luar penjualan (rusak, internal, hilang, dll.). Stok berkurang otomatis setelah dikonfirmasi." />
      {branch && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={`Unit berseri di ${branch.name} (${units.length})`}>
            {units.length === 0 ? <Empty title="Tidak ada unit tersedia" /> : (
              <ActionForm action={issueStockAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="branch_id" value={branch.id} />
                <Field label="Unit" className="sm:col-span-2"><select className="input" name="item" required defaultValue=""><option value="" disabled>Pilih unit…</option>{units.map((u) => <option key={u.id} value={`${u.product_id}:${u.id}`}>{u.internal_asset_code} · {u.products?.name}{u.serial_number ? ` · SN ${u.serial_number}` : ''}</option>)}</select></Field>
                <Common />
                <div className="sm:col-span-2"><SubmitButton confirm="Keluarkan unit ini dari stok? Tindakan tercatat di riwayat.">Catat barang keluar</SubmitButton></div>
              </ActionForm>)}
          </Card>
          <Card title={`Aksesori di ${branch.name} (${bal.length})`}>
            {bal.length === 0 ? <Empty title="Tidak ada aksesori bersaldo" /> : (
              <ActionForm action={issueStockAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="branch_id" value={branch.id} />
                <Field label="Produk"><select className="input" name="item" required defaultValue=""><option value="" disabled>Pilih aksesori…</option>{bal.map((b) => <option key={b.product_id} value={b.product_id}>{b.products?.sku} · {b.products?.name} (stok {nf(b.qty)})</option>)}</select></Field>
                <Field label="Jumlah"><input className="input" type="number" name="qty" min={1} required /></Field>
                <Common />
                <div className="sm:col-span-2"><SubmitButton confirm="Keluarkan barang ini dari stok?">Catat barang keluar</SubmitButton></div>
              </ActionForm>)}
          </Card>
        </div>)}
      <h2 className="mb-2 mt-6 font-semibold">Riwayat barang keluar</h2>
      {recent.length === 0 ? <Empty title="Belum ada barang keluar" /> : (
        <TableWrap><table className="tbl"><thead><tr><th>Tanggal</th><th>No.</th><th>Produk</th><th className="text-right">Jml</th><th>Alasan</th><th>Petugas</th></tr></thead><tbody>
          {recent.map((m) => (<tr key={m.id}><td className="whitespace-nowrap">{fdatetime(m.created_at)}</td><td>{m.ref_no && <Chip>{m.ref_no}</Chip>}</td><td>{m.products?.name}</td><td className="text-right text-bad">{m.qty}</td><td>{m.reason}{m.note && <div className="text-xs text-ink-500">{m.note}</div>}</td><td>{m.profiles?.full_name ?? '-'}</td></tr>))}
        </tbody></table></TableWrap>)}
    </>
  );
}
