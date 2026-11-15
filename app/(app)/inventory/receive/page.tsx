import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { CONDITION } from '@/lib/labels';
import { fdatetime, nf, ymdWIB } from '@/lib/format';
import { Card, Chip, Empty, Field, PageHeader, TableWrap } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { receiveBulkAction } from '../actions';
import { receiveGoodsQtyAction, receiveGoodsUnitAction } from '../stock-actions';

type M = { id: string; created_at: string; qty: number; reason: string | null; ref_no: string | null; supplier: string | null; note: string | null; products: { name: string } | null; branches: { name: string } | null; profiles: { full_name: string } | null; inventory_units: { internal_asset_code: string } | null };

export default async function ReceivePage() {
  const ctx = await requirePage('inventory.write');
  const [prods, recent] = await Promise.all([
    run<{ id: string; sku: string; name: string; tracking: string }[]>('produk', () => ctx.sb.from('products').select('id,sku,name,tracking').eq('archived', false).order('sku').limit(1000)),
    run<M[]>('riwayat masuk', () => ctx.sb.from('stock_movements').select('id,created_at,qty,reason,ref_no,supplier,note,products(name),branches(name),profiles:actor_id(full_name),inventory_units(internal_asset_code)').eq('type', 'receive').in('branch_id', ctx.branchIds).order('created_at', { ascending: false }).limit(20)),
  ]);
  const ser = prods.filter((p) => p.tracking === 'serialized'), qty = prods.filter((p) => p.tracking === 'quantity');
  const def = ctx.branch?.id ?? '';
  const Branch = () => (<Field label="Lokasi penerimaan"><input type="hidden" name="branch_id" value={def} /><div className="input bg-canvas text-ink-500" aria-readonly>{ctx.branch?.name ?? 'Cidodol'}</div></Field>);
  const Cond = () => (<Field label="Kondisi"><select className="input" name="condition" defaultValue="belum_diperiksa">{Object.entries(CONDITION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>);
  return (
    <>
      <PageHeader title="Barang Masuk" sub="Setiap unit berseri mendapat kode internal otomatis. Kosongkan nomor seri bila belum diketahui — jangan diisi dengan nomor karangan." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Terima 1 unit berseri">
          <ActionForm action={receiveGoodsUnitAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <Field label="Produk" className="sm:col-span-2"><select className="input" name="product_id" required defaultValue=""><option value="" disabled>Pilih produk…</option>{ser.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></Field>
            <Branch /><Cond />
            <Field label="Nomor seri pabrikan"><input className="input font-mono" name="serial" maxLength={80} /></Field>
            <Field label="Tanggal masuk"><input className="input" type="date" name="received_at" defaultValue={ymdWIB()} /></Field>
            <Field label="Pemasok / sumber barang"><input className="input" name="supplier" maxLength={120} /></Field>
            <Field label="Nomor referensi"><input className="input" name="ref" maxLength={80} placeholder="No. nota / surat jalan" /></Field>
            <Field label="Harga modal (Rp)"><input className="input" type="number" min={0} name="cost" /></Field>
            <Field label="Keterangan"><input className="input" name="notes" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Simpan barang masuk</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card title="Input massal nomor seri (satu per baris)">
          <ActionForm action={receiveBulkAction} resetOnSuccess className="space-y-3">
            <Field label="Produk"><select className="input" name="product_id" required defaultValue=""><option value="" disabled>Pilih produk…</option>{ser.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Branch /><Cond /></div>
            <Field label="Daftar nomor seri" hint="Duplikat di input atau di database akan menolak seluruh input."><textarea className="input font-mono" name="serials" rows={6} required /></Field>
            <SubmitButton>Simpan semua</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Terima aksesori (kuantitas)" className="lg:col-span-2">
          <ActionForm action={receiveGoodsQtyAction} resetOnSuccess className="grid gap-3 sm:grid-cols-4">
            <Field label="Produk" className="sm:col-span-2"><select className="input" name="product_id" required defaultValue=""><option value="" disabled>Pilih aksesori…</option>{qty.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></Field>
            <Branch />
            <Field label="Jumlah"><input className="input" type="number" min={1} name="qty" required /></Field>
            <Field label="Tanggal masuk"><input className="input" type="date" name="received_at" defaultValue={ymdWIB()} /></Field>
            <Field label="Pemasok"><input className="input" name="supplier" maxLength={120} /></Field>
            <Field label="Nomor referensi"><input className="input" name="ref" maxLength={80} /></Field>
            <Field label="Keterangan"><input className="input" name="reason" /></Field>
            <div className="sm:self-end"><SubmitButton>Tambah stok</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Riwayat barang masuk</h2>
      {recent.length === 0 ? <Empty title="Belum ada barang masuk" /> : (
        <TableWrap><table className="tbl"><thead><tr><th>Tanggal</th><th>Produk</th><th className="text-right">Jml</th><th>Pemasok</th><th>Referensi</th><th>Petugas</th></tr></thead><tbody>
          {recent.map((m) => (<tr key={m.id}><td className="whitespace-nowrap">{fdatetime(m.created_at)}</td><td>{m.products?.name}{m.inventory_units && <div><Chip>{m.inventory_units.internal_asset_code}</Chip></div>}</td><td className="text-right text-ok">+{nf(m.qty)}</td><td>{m.supplier ?? '-'}</td><td className="text-xs">{m.ref_no && <Chip>{m.ref_no}</Chip>} {m.note ?? m.reason}</td><td>{m.profiles?.full_name ?? '-'}</td></tr>))}
        </tbody></table></TableWrap>)}
    </>
  );
}
