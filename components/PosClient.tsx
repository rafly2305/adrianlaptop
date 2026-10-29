'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionForm, SubmitButton } from './ActionForm';
import { createSaleAction } from '@/app/(app)/sales/actions';

type Hit = { kind: 'unit'; product_id: string; unit_id: string; name: string; code: string; serial: string | null; price: number | null } | { kind: 'qty'; product_id: string; name: string; stock: number; price: number | null };
type Line = { key: string; product_id: string; unit_id?: string; name: string; code?: string; serial?: string | null; qty: number; max?: number; price: number; discount: number };
const rp = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

export function PosClient({ branches, defaultBranch, methods }: { branches: { id: string; name: string; is_demo: boolean }[]; defaultBranch: string; methods: string[] }) {
  const [branch, setBranch] = useState(defaultBranch);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cart, setCart] = useState<Line[]>([]);
  const [pay, setPay] = useState<'full' | 'partial' | 'none'>('full');
  const [paid, setPaid] = useState(0);
  const [cust, setCust] = useState({ name: '', phone: '', address: '' });
  const [method, setMethod] = useState(methods[0] ?? '');
  const [notes, setNotes] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); setErr(null); return; }
    timer.current = setTimeout(async () => {
      setSearching(true); setErr(null);
      try {
        const r = await fetch(`/api/pos/search?branch=${branch}&q=${encodeURIComponent(q.trim())}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Pencarian gagal');
        setHits(j.results);
      } catch (e) { setErr((e as Error).message); setHits([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q, branch]);

  const add = (h: Hit) => setCart((c) => {
    if (h.kind === 'unit') { if (c.some((l) => l.unit_id === h.unit_id)) return c; return [...c, { key: h.unit_id, product_id: h.product_id, unit_id: h.unit_id, name: h.name, code: h.code, serial: h.serial, qty: 1, price: h.price ?? 0, discount: 0 }]; }
    const ex = c.find((l) => !l.unit_id && l.product_id === h.product_id);
    if (ex) return c.map((l) => (l === ex ? { ...l, qty: Math.min(l.qty + 1, h.stock) } : l));
    return [...c, { key: h.product_id, product_id: h.product_id, name: h.name, qty: 1, max: h.stock, price: h.price ?? 0, discount: 0 }];
  });
  const upd = (key: string, patch: Partial<Line>) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const subtotal = useMemo(() => cart.reduce((a, l) => a + l.price * l.qty, 0), [cart]);
  const discount = useMemo(() => cart.reduce((a, l) => a + l.discount, 0), [cart]);
  const total = subtotal - discount;
  const payload = JSON.stringify({
    branch_id: branch, customer: cust, method: method || undefined, pay, paid: pay === 'partial' ? paid : undefined, notes: notes || undefined,
    items: cart.map((l) => ({ product_id: l.product_id, unit_id: l.unit_id, qty: l.qty, unit_price: l.price, discount: l.discount })),
  });
  const invalid = cart.length === 0 || cart.some((l) => l.price <= 0 || l.discount > l.price * l.qty) || (pay !== 'none' && !method);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <section className="card p-4 lg:col-span-2">
        <label className="label" htmlFor="pos-branch">Cabang</label>
        <select id="pos-branch" className="input mb-4" value={branch} onChange={(e) => { setBranch(e.target.value); setCart([]); setHits([]); }}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_demo ? ' (Demo)' : ''}</option>)}
        </select>
        <label className="label" htmlFor="pos-q">Cari produk / nomor seri / kode unit</label>
        <input id="pos-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik minimal 2 huruf…" autoComplete="off" />
        <div className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto" aria-live="polite">
          {searching && <p className="text-sm text-ink-500">Mencari…</p>}
          {err && <p role="alert" className="text-sm text-bad">{err}</p>}
          {!searching && !err && q.trim().length >= 2 && hits.length === 0 && <p className="text-sm text-ink-500">Tidak ada unit/stok tersedia yang cocok di cabang ini.</p>}
          {hits.map((h) => (
            <button type="button" key={h.kind === 'unit' ? h.unit_id : h.product_id} onClick={() => add(h)} className="flex w-full items-center justify-between gap-2 rounded border border-ink-300/50 px-3 py-2 text-left text-sm hover:bg-brand-soft">
              <span><span className="block font-medium">{h.name}</span>
                {h.kind === 'unit' ? <span className="chip">{h.code}</span> : <span className="text-xs text-ink-500">Aksesori · stok {h.stock}</span>}
                {h.kind === 'unit' && (h.serial ? <span className="chip ml-1">SN {h.serial}</span> : <span className="ml-1 text-xs text-warn">serial belum ada</span>)}</span>
              <span className="text-xs text-brand">Tambah</span>
            </button>))}
        </div>
      </section>

      <ActionForm action={createSaleAction} className="card space-y-4 p-4 lg:col-span-3">
        <input type="hidden" name="payload" value={payload} />
        <h2 className="font-semibold">Keranjang</h2>
        {cart.length === 0 ? <p className="text-sm text-ink-500">Belum ada item. Cari dan pilih unit di sebelah kiri.</p> : (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Item</th><th>Jml</th><th>Harga (Rp)</th><th>Diskon (Rp)</th><th className="text-right">Total</th><th /></tr></thead><tbody>
            {cart.map((l) => (
              <tr key={l.key}>
                <td><div className="font-medium">{l.name}</div>{l.code && <span className="chip">{l.code}</span>}{l.serial && <span className="chip ml-1">SN {l.serial}</span>}</td>
                <td>{l.unit_id ? 1 : <input className="input w-16" type="number" min={1} max={l.max} value={l.qty} onChange={(e) => upd(l.key, { qty: Math.max(1, Math.min(l.max ?? 1, Number(e.target.value) || 1)) })} aria-label="Jumlah" />}</td>
                <td><input className="input w-32" type="number" min={0} value={l.price || ''} onChange={(e) => upd(l.key, { price: Number(e.target.value) || 0 })} aria-label="Harga" /></td>
                <td><input className="input w-28" type="number" min={0} value={l.discount || ''} onChange={(e) => upd(l.key, { discount: Number(e.target.value) || 0 })} aria-label="Diskon" /></td>
                <td className="text-right">{rp(l.price * l.qty - l.discount)}</td>
                <td><button type="button" className="text-bad" onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))} aria-label="Hapus item">✕</button></td>
              </tr>))}
          </tbody></table></div>)}
        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{rp(subtotal)}</span></div>
          <div className="flex justify-between"><span>Diskon</span><span>- {rp(discount)}</span></div>
          <div className="flex justify-between border-t border-ink-300/50 pt-1 text-base font-semibold"><span>Total</span><span>{rp(total)}</span></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="label">Nama pelanggan</span><input className="input" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></label>
          <label className="block"><span className="label">Telepon</span><input className="input" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} inputMode="tel" /></label>
          <label className="block"><span className="label">Alamat</span><input className="input" value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} /></label>
          <label className="block"><span className="label">Pembayaran</span><select className="input" value={pay} onChange={(e) => setPay(e.target.value as typeof pay)}><option value="full">Lunas</option><option value="partial">Bayar sebagian</option><option value="none">Belum dibayar</option></select></label>
          <label className="block"><span className="label">Metode</span><select className="input" value={method} onChange={(e) => setMethod(e.target.value)} disabled={pay === 'none'}>{methods.map((m) => <option key={m}>{m}</option>)}</select></label>
          {pay === 'partial' && <label className="block"><span className="label">Dibayar (Rp)</span><input className="input" type="number" min={0} max={total} value={paid || ''} onChange={(e) => setPaid(Number(e.target.value) || 0)} /></label>}
          <label className="block sm:col-span-3"><span className="label">Catatan</span><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        {invalid && cart.length > 0 && <p className="text-sm text-warn">Lengkapi harga tiap item (harus &gt; 0) dan pastikan diskon tidak melebihi harga.</p>}
        <SubmitButton className={`btn-primary w-full ${invalid ? 'pointer-events-none opacity-50' : ''}`} confirm={`Simpan transaksi ${rp(total)}? Unit berseri akan berstatus Terjual.`}>Simpan transaksi</SubmitButton>
      </ActionForm>
    </div>
  );
}
