import { ActionForm, SubmitButton } from './ActionForm';
import { Field } from './ui';
import { saveProductAction } from '@/app/(app)/inventory/actions';

type P = { id?: string; sku?: string; name?: string; brand?: string | null; model?: string | null; category_id?: string | null; tracking?: string; processor?: string | null; ram_gb?: number | null; storage?: string | null; touchscreen?: boolean | null; min_stock?: number | null; default_price?: number | null; needs_verification?: boolean };

export function ProductForm({ product, categories }: { product?: P; categories: { id: string; name: string }[] }) {
  const p = product ?? {};
  return (
    <ActionForm action={saveProductAction} className="grid gap-4 sm:grid-cols-2">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <Field label="SKU internal (unik)"><input className="input font-mono" name="sku" required defaultValue={p.sku} placeholder="mis. LTP-0100" /></Field>
      <Field label="Nama produk"><input className="input" name="name" required defaultValue={p.name} /></Field>
      <Field label="Merek"><input className="input" name="brand" defaultValue={p.brand ?? ''} /></Field>
      <Field label="Model"><input className="input" name="model" defaultValue={p.model ?? ''} /></Field>
      <Field label="Kategori"><select className="input" name="category_id" required defaultValue={p.category_id ?? ''}><option value="" disabled>Pilih…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Pengelolaan stok" hint="Berseri: tiap unit punya nomor seri. Kuantitas: aksesori tanpa serial individual."><select className="input" name="tracking" defaultValue={p.tracking ?? 'serialized'} disabled={!!p.id}><option value="serialized">Berseri (per unit)</option><option value="quantity">Kuantitas</option></select>{p.id && <input type="hidden" name="tracking" value={p.tracking} />}</Field>
      <Field label="Prosesor"><input className="input" name="processor" defaultValue={p.processor ?? ''} /></Field>
      <Field label="RAM (GB)"><input className="input" name="ram_gb" type="number" min={1} defaultValue={p.ram_gb ?? ''} /></Field>
      <Field label="Storage"><input className="input" name="storage" defaultValue={p.storage ?? ''} placeholder="mis. 256 GB" /></Field>
      <Field label="Layar sentuh"><select className="input" name="touchscreen" defaultValue={p.touchscreen == null ? '' : p.touchscreen ? 'ya' : 'tidak'}><option value="">Tidak diketahui</option><option value="ya">Ya</option><option value="tidak">Tidak</option></select></Field>
      <Field label="Batas stok minimal" hint="Kosong = tanpa peringatan stok menipis."><input className="input" name="min_stock" type="number" min={0} defaultValue={p.min_stock ?? ''} /></Field>
      <Field label="Harga jual default (Rp)" hint="Opsional; bisa diubah per transaksi."><input className="input" name="default_price" type="number" min={0} step="1000" defaultValue={p.default_price ?? ''} /></Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="needs_verification" defaultChecked={p.needs_verification} /> Spesifikasi perlu diverifikasi fisik</label>
      <div className="sm:col-span-2"><SubmitButton>Simpan produk</SubmitButton></div>
    </ActionForm>
  );
}
