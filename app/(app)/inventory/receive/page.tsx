import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { CONDITION } from '@/lib/labels';
import { ymdWIB } from '@/lib/format';
import { Card, Field, PageHeader } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { receiveBulkAction, receiveQtyAction, receiveUnitAction } from '../actions';

export default async function ReceivePage() {
  const ctx = await requirePage('inventory.write');
  const prods = await run<{ id: string; sku: string; name: string; tracking: string }[]>('produk', () => ctx.sb.from('products').select('id,sku,name,tracking').eq('archived', false).order('sku').limit(1000));
  const ser = prods.filter((p) => p.tracking === 'serialized'), qty = prods.filter((p) => p.tracking === 'quantity');
  const def = ctx.branch?.id ?? ctx.scopeBranches[0]?.id;
  const Branch = () => (<Field label="Cabang"><select className="input" name="branch_id" required defaultValue={def}>{ctx.scopeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_demo ? ' (Demo)' : ''}</option>)}</select></Field>);
  const Cond = () => (<Field label="Kondisi"><select className="input" name="condition" defaultValue="belum_diperiksa">{Object.entries(CONDITION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>);
  return (
    <>
      <PageHeader title="Penerimaan barang" sub="Setiap unit berseri mendapat kode internal otomatis. Kosongkan nomor seri bila belum diketahui — jangan diisi dengan nomor karangan." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Terima 1 unit berseri">
          <ActionForm action={receiveUnitAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <Field label="Produk" className="sm:col-span-2"><select className="input" name="product_id" required defaultValue=""><option value="" disabled>Pilih produk…</option>{ser.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></Field>
            <Branch /><Cond />
            <Field label="Nomor seri pabrikan"><input className="input font-mono" name="serial" maxLength={80} /></Field>
            <Field label="Tanggal masuk"><input className="input" type="date" name="received_at" defaultValue={ymdWIB()} /></Field>
            <Field label="Harga modal (Rp)"><input className="input" type="number" min={0} name="cost" /></Field>
            <Field label="Catatan"><input className="input" name="notes" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Simpan unit</SubmitButton></div>
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
          <ActionForm action={receiveQtyAction} resetOnSuccess className="grid gap-3 sm:grid-cols-4">
            <Field label="Produk" className="sm:col-span-2"><select className="input" name="product_id" required defaultValue=""><option value="" disabled>Pilih aksesori…</option>{qty.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></Field>
            <Branch />
            <Field label="Jumlah"><input className="input" type="number" min={1} name="qty" required /></Field>
            <Field label="Keterangan" className="sm:col-span-3"><input className="input" name="reason" /></Field>
            <div className="sm:self-end"><SubmitButton>Tambah stok</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
