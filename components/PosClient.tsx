'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from 'react';
import { ActionForm, SubmitButton } from './ActionForm';
import { createSalePosAction } from '@/app/(app)/sales/actions';

const rp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
type Unit = { id: string; code: string; serial: string | null };
type Item = { id: string; sku: string; name: string; price: number | null; image_url: string | null; tracking: 'serialized' | 'quantity'; category: string | null; available: number; units: Unit[]; matched_unit_id: string | null };
type Line = { key: string; product_id: string; name: string; sku: string; image_url: string | null; tracking: 'serialized' | 'quantity'; unit_id?: string; unit_code?: string; qty: number; price: number; discount: number; max: number };

function Thumb({ src, name, size = 'h-24' }: { src: string | null; name: string; size?: string }) {
  return src
    ? <img src={src} alt={name} loading="lazy" className={`${size} w-full rounded-t-md object-cover`} />
    : <div className={`${size} flex w-full items-center justify-center rounded-t-md bg-brand-soft text-2xl font-semibold text-brand`} aria-hidden>{name.trim().slice(0, 2).toUpperCase()}</div>;
}

export function PosClient({ branches, defaultBranch, nonCashMethods, taxPercent }: { branches: { id: string; name: string }[]; defaultBranch: string; nonCashMethods: string[]; taxPercent: number }) {
  const [branch, setBranch] = useState(defaultBranch);
  const [q, setQ] = useState(''); const [cat, setCat] = useState('');
  const [items, setItems] = useState<Item[]>([]); const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false); const [err, setErr] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' });
  const [extra, setExtra] = useState(0); const [notes, setNotes] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [kind, setKind] = useState<'cash' | 'noncash'>('cash');
  const [tendered, setTendered] = useState(''); const [method, setMethod] = useState(nonCashMethods[0]); const [ref, setRef] = useState(''); const [payNote, setPayNote] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true); setErr('');
      try {
        const r = await fetch(`/api/pos/catalog?branch=${branch}&q=${encodeURIComponent(q)}&cat=${cat}`, { signal: ctrl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Gagal memuat produk');
        setItems(j.items); setCats(j.categories);
      } catch (e) { if ((e as Error).name !== 'AbortError') setErr((e as Error).message); }
      finally { setLoading(false); }
    }, q ? 250 : 0);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [branch, q, cat]);

  const inCart = (pid: string) => cart.filter((l) => l.product_id === pid).reduce((a, l) => a + l.qty, 0);

  const add = (it: Item) => {
    if (it.available - inCart(it.id) <= 0) return;
    setCart((c) => {
      if (it.tracking === 'serialized') {
        const used = new Set(c.filter((l) => l.product_id === it.id).map((l) => l.unit_id));
        const pref = it.matched_unit_id && !used.has(it.matched_unit_id) ? it.units.find((u) => u.id === it.matched_unit_id) : undefined;
        const u = pref ?? it.units.find((x) => !used.has(x.id));
        if (!u) return c;
        return [...c, { key: u.id, product_id: it.id, name: it.name, sku: it.sku, image_url: it.image_url, tracking: 'serialized', unit_id: u.id, unit_code: u.code, qty: 1, price: it.price ?? 0, discount: 0, max: 1 }];
      }
      const ex = c.find((l) => l.product_id === it.id);
      if (ex) return c.map((l) => (l === ex ? { ...l, qty: Math.min(l.qty + 1, it.available) } : l));
      return [...c, { key: it.id, product_id: it.id, name: it.name, sku: it.sku, image_url: it.image_url, tracking: 'quantity', qty: 1, price: it.price ?? 0, discount: 0, max: it.available }];
    });
  };
  const patch = (key: string, p: Partial<Line>) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const remove = (key: string) => setCart((c) => c.filter((l) => l.key !== key));
  const swapUnit = (l: Line, uid: string) => {
    const it = items.find((i) => i.id === l.product_id); const u = it?.units.find((x) => x.id === uid);
    if (u) setCart((c) => c.map((x) => (x.key === l.key ? { ...x, key: u.id, unit_id: u.id, unit_code: u.code } : x)));
  };
  const changeBranch = (b: string) => {
    if (b === branch) return;
    if (cart.length && !window.confirm('Mengganti cabang akan mengosongkan keranjang. Lanjutkan?')) return;
    setCart([]); setBranch(b);
  };

  const t = useMemo(() => {
    const sub = cart.reduce((a, l) => a + l.price * l.qty, 0);
    const itemDisc = cart.reduce((a, l) => a + Math.min(l.discount, l.price * l.qty), 0);
    const extraC = Math.min(Math.max(extra || 0, 0), Math.max(sub - itemDisc, 0));
    const taxable = sub - itemDisc - extraC;
    const tax = taxPercent > 0 ? Math.round((taxable * taxPercent) / 100) : 0;
    return { sub, itemDisc, extraC, tax, total: taxable + tax };
  }, [cart, extra, taxPercent]);

  const noPrice = cart.some((l) => l.price <= 0);
  const tend = Number(tendered || 0);
  const change = kind === 'cash' ? tend - t.total : 0;
  const canPay = cart.length > 0 && !noPrice && (kind === 'noncash' || tend >= t.total);
  const quick = [...new Set([t.total, Math.ceil(t.total / 50000) * 50000, Math.ceil(t.total / 100000) * 100000, Math.ceil(t.total / 100000) * 100000 + 100000])].filter((n) => n >= t.total && n > 0);
  const payload = JSON.stringify({
    branch_id: branch, customer, extra_discount: t.extraC, kind, method: kind === 'cash' ? 'Tunai' : method, tendered: kind === 'cash' ? tend : t.total,
    reference: ref, pay_note: payNote, notes,
    items: cart.map((l) => ({ product_id: l.product_id, unit_id: l.unit_id, qty: l.qty, unit_price: l.price, discount: Math.min(l.discount, l.price * l.qty) })),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section aria-label="Daftar produk">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {branches.length > 1 && <select className="input w-auto" value={branch} onChange={(e) => changeBranch(e.target.value)} aria-label="Cabang">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
          <input className="input min-w-[220px] flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, SKU, atau nomor seri…" aria-label="Cari produk" autoFocus />
          <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Kategori"><option value="">Semua kategori</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
        {err && <div role="alert" className="mb-3 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{err}</div>}
        {loading && items.length === 0 ? <p className="text-sm text-ink-500">Memuat produk…</p> : items.length === 0 ? <p className="rounded-lg border border-dashed border-ink-300 p-6 text-center text-sm text-ink-500">Tidak ada produk yang cocok.</p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((it) => {
              const left = it.available - inCart(it.id); const out = left <= 0;
              return (
                <button key={it.id} type="button" onClick={() => add(it)} disabled={out} aria-label={`Tambah ${it.name}`}
                  className={`card overflow-hidden text-left transition ${out ? 'cursor-not-allowed opacity-50' : 'hover:border-brand hover:shadow'}`}>
                  <div className="relative"><Thumb src={it.image_url} name={it.name} />
                    <span className={`absolute right-1 top-1 rounded px-1.5 py-0.5 text-xs font-medium ${it.available === 0 ? 'bg-bad text-white' : 'bg-white/90 text-ink'}`}>{it.available === 0 ? 'Habis' : out ? 'Di keranjang' : `Stok ${left}`}</span></div>
                  <div className="space-y-1 p-2">
                    <div className="line-clamp-2 text-sm font-medium leading-snug">{it.name}</div>
                    <div className="chip">{it.sku}</div>
                    <div className={`text-sm font-semibold ${it.price ? 'text-brand' : 'text-warn'}`}>{it.price ? rp(it.price) : 'Harga belum diisi'}</div>
                  </div>
                </button>
              );
            })}
          </div>)}
      </section>

      <aside aria-label="Keranjang" className="card self-start p-3 lg:sticky lg:top-20">
        <h2 className="mb-2 font-semibold">Keranjang {cart.length > 0 && <span className="text-sm font-normal text-ink-500">({cart.length} item)</span>}</h2>
        {cart.length === 0 ? <p className="py-6 text-center text-sm text-ink-500">Klik produk untuk menambahkannya.</p> : (
          <ul className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {cart.map((l) => {
              const it = items.find((i) => i.id === l.product_id);
              const free = it?.units.filter((u) => u.id === l.unit_id || !cart.some((x) => x.unit_id === u.id)) ?? [];
              return (
                <li key={l.key} className="rounded-md border border-ink-300/50 p-2 text-sm">
                  <div className="flex gap-2">
                    {l.image_url ? <img src={l.image_url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-brand-soft text-xs font-semibold text-brand">{l.name.slice(0, 2).toUpperCase()}</div>}
                    <div className="min-w-0 flex-1"><div className="truncate font-medium">{l.name}</div>
                      {l.tracking === 'serialized' && (free.length > 1 ? <select className="input mt-1 py-0.5 text-xs" value={l.unit_id} onChange={(e) => swapUnit(l, e.target.value)} aria-label="Pilih unit">{free.map((u) => <option key={u.id} value={u.id}>{u.code}{u.serial ? ` · SN ${u.serial}` : ''}</option>)}</select> : <span className="chip">{l.unit_code}</span>)}</div>
                    <button type="button" onClick={() => remove(l.key)} className="self-start rounded p-1 text-ink-500 hover:bg-bad-soft hover:text-bad" aria-label={`Hapus ${l.name}`}>✕</button>
                  </div>
                  <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
                    <label className="text-xs text-ink-500">Harga satuan<input className="input py-1 text-sm" type="number" min={0} value={l.price || ''} onChange={(e) => patch(l.key, { price: Number(e.target.value) })} /></label>
                    <div className="flex items-center gap-1" aria-label="Jumlah">
                      <button type="button" className="btn-ghost px-2 py-1" disabled={l.tracking === 'serialized' || l.qty <= 1} onClick={() => patch(l.key, { qty: l.qty - 1 })} aria-label="Kurangi">−</button>
                      <span className="w-7 text-center">{l.qty}</span>
                      <button type="button" className="btn-ghost px-2 py-1" disabled={l.tracking === 'serialized' || l.qty >= l.max} onClick={() => patch(l.key, { qty: l.qty + 1 })} aria-label="Tambah">+</button>
                    </div>
                  </div>
                  <div className="mt-1 grid grid-cols-[1fr_auto] items-end gap-2">
                    <label className="text-xs text-ink-500">Diskon item (Rp)<input className="input py-1 text-sm" type="number" min={0} value={l.discount || ''} onChange={(e) => patch(l.key, { discount: Number(e.target.value) })} /></label>
                    <div className="pb-1 text-right font-medium">{rp(l.price * l.qty - Math.min(l.discount, l.price * l.qty))}</div>
                  </div>
                  {l.price <= 0 && <div className="mt-1 text-xs text-warn">Isi harga satuan sebelum membayar.</div>}
                </li>);
            })}
          </ul>)}

        <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Pelanggan & catatan</summary>
          <div className="mt-2 space-y-2">
            <input className="input" placeholder="Nama pelanggan (opsional)" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
            <input className="input" placeholder="No. telepon" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
            <input className="input" placeholder="Alamat" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
            <input className="input" placeholder="Catatan transaksi" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div></details>

        <dl className="mt-3 space-y-1 border-t border-dashed border-ink-300 pt-3 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{rp(t.sub)}</dd></div>
          {t.itemDisc > 0 && <div className="flex justify-between"><dt>Diskon item</dt><dd>− {rp(t.itemDisc)}</dd></div>}
          <div className="flex items-center justify-between gap-2"><dt>Diskon transaksi</dt><dd><input className="input w-32 py-1 text-right" type="number" min={0} value={extra || ''} onChange={(e) => setExtra(Number(e.target.value))} aria-label="Diskon transaksi" /></dd></div>
          {taxPercent > 0 && <div className="flex justify-between"><dt>Pajak ({taxPercent}%)</dt><dd>{rp(t.tax)}</dd></div>}
          <div className="flex justify-between text-lg font-semibold"><dt>Total</dt><dd>{rp(t.total)}</dd></div>
        </dl>
        <button type="button" className="btn-primary mt-3 w-full py-3 text-base" disabled={cart.length === 0 || noPrice} onClick={() => { setTendered(''); setPayOpen(true); }}>Bayar {cart.length > 0 && rp(t.total)}</button>
        {cart.length > 0 && <button type="button" className="mt-2 w-full text-sm text-ink-500 hover:text-bad" onClick={() => { if (window.confirm('Kosongkan keranjang?')) { setCart([]); setExtra(0); } }}>Kosongkan keranjang</button>}
      </aside>

      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Pembayaran">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-xl bg-white p-4 sm:rounded-xl">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Pembayaran</h2><button type="button" className="rounded p-1 hover:bg-canvas" onClick={() => setPayOpen(false)} aria-label="Tutup">✕</button></div>
            <div className="mb-3 rounded-md bg-brand-soft p-3 text-center"><div className="text-xs text-ink-500">Total tagihan</div><div className="text-2xl font-bold text-brand">{rp(t.total)}</div></div>
            <div className="mb-3 grid grid-cols-2 gap-2" role="tablist">
              {(['cash', 'noncash'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`rounded-md border px-3 py-2 text-sm font-medium ${kind === k ? 'border-brand bg-brand text-white' : 'border-ink-300 bg-white'}`}>{k === 'cash' ? 'Tunai' : 'Non-Tunai'}</button>)}
            </div>
            <ActionForm action={createSalePosAction} className="space-y-3">
              <input type="hidden" name="payload" value={payload} />
              {kind === 'cash' ? (
                <>
                  <label className="block"><span className="label">Uang diterima (Rp)</span><input className="input text-lg" type="number" min={0} value={tendered} onChange={(e) => setTendered(e.target.value)} autoFocus /></label>
                  <div className="flex flex-wrap gap-2">{quick.map((n) => <button key={n} type="button" className="btn-ghost py-1 text-sm" onClick={() => setTendered(String(n))}>{n === t.total ? 'Uang pas' : rp(n)}</button>)}</div>
                  <dl className="space-y-1 rounded-md border border-ink-300/50 p-3 text-sm">
                    <div className="flex justify-between"><dt>Total transaksi</dt><dd>{rp(t.total)}</dd></div>
                    <div className="flex justify-between"><dt>Uang diterima</dt><dd>{rp(tend)}</dd></div>
                    <div className={`flex justify-between text-base font-semibold ${change < 0 ? 'text-bad' : 'text-ok'}`}><dt>{change < 0 ? 'Kurang' : 'Kembalian'}</dt><dd>{rp(Math.abs(change))}</dd></div>
                  </dl>
                </>
              ) : (
                <>
                  <label className="block"><span className="label">Metode</span><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{nonCashMethods.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
                  <label className="block"><span className="label">Nomor referensi (opsional)</span><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={100} placeholder="mis. no. transaksi bank" /></label>
                  <label className="block"><span className="label">Catatan pembayaran (opsional)</span><input className="input" value={payNote} onChange={(e) => setPayNote(e.target.value)} maxLength={200} /></label>
                </>
              )}
              <p className="text-xs text-ink-500">Transaksi hanya selesai bila pembayaran mencukupi; status otomatis LUNAS.</p>
              {canPay ? <SubmitButton className="btn-primary w-full py-3 text-base">Selesaikan transaksi</SubmitButton> : <button type="button" className="btn-primary w-full py-3 text-base opacity-50" disabled>{kind === 'cash' ? 'Uang diterima belum cukup' : 'Lengkapi pembayaran'}</button>}
            </ActionForm>
          </div>
        </div>)}
    </div>
  );
}
