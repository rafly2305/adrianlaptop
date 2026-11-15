'use client';
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, Building2, CheckCircle2, CreditCard, QrCode, ShoppingCart, X } from 'lucide-react';
import { createSalePosAction } from '@/app/(app)/sales/actions';
import { calcTotals, parsePercent, validPercent } from '@/lib/pos-calc';

const rp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
type Method = 'Tunai' | 'QRIS' | 'Transfer Bank' | 'Kartu Debit';
type Unit = { id: string; code: string; serial: string | null };
type Item = { id: string; sku: string; name: string; price: number | null; image_url: string | null; tracking: 'serialized' | 'quantity'; category: string | null; available: number; units: Unit[]; matched_unit_id: string | null };
type Line = { key: string; product_id: string; name: string; sku: string; image_url: string | null; tracking: 'serialized' | 'quantity'; unit_id?: string; unit_code?: string; qty: number; price: number; max: number };
export type BankAccount = { bank: string; number: string; holder: string };
type Done = { id: string; invoice_no: string; total: number; method: string };

const METHODS: { key: Method; label: string; hint: string; Icon: typeof Banknote }[] = [
  { key: 'Tunai', label: 'Tunai', hint: 'Terima uang & hitung kembalian', Icon: Banknote },
  { key: 'QRIS', label: 'QRIS', hint: 'Pelanggan memindai kode QR', Icon: QrCode },
  { key: 'Transfer Bank', label: 'Transfer Bank', hint: 'Ke rekening toko', Icon: Building2 },
  { key: 'Kartu Debit', label: 'Kartu Debit', hint: 'Lewat mesin EDC', Icon: CreditCard },
];

function Thumb({ src, name, size = 'h-24' }: { src: string | null; name: string; size?: string }) {
  return src
    ? <img src={src} alt={name} loading="lazy" className={`${size} w-full rounded-t-md object-cover`} />
    : <div className={`${size} flex w-full items-center justify-center rounded-t-md bg-brand-soft text-2xl font-semibold text-brand`} aria-hidden>{name.trim().slice(0, 2).toUpperCase()}</div>;
}

export function PosClient({ branchId, locationName, taxPercent, canEditTax, maxDiscountPercent, canManageSettings, qris, banks }: {
  branchId: string; locationName: string; taxPercent: number; canEditTax: boolean; maxDiscountPercent: number; canManageSettings: boolean;
  qris: { imageUrl: string; merchant: string }; banks: BankAccount[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(''); const [cat, setCat] = useState('');
  const [items, setItems] = useState<Item[]>([]); const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false); const [err, setErr] = useState(''); const [refresh, setRefresh] = useState(0);
  const [cart, setCart] = useState<Line[]>([]);
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '' });
  const [notes, setNotes] = useState('');
  const [discStr, setDiscStr] = useState(''); const [taxStr, setTaxStr] = useState(String(taxPercent || 0));
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<Method | null>(null);
  const [tendered, setTendered] = useState(''); const [ref, setRef] = useState(''); const [payNote, setPayNote] = useState(''); const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false); const [payErr, setPayErr] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const lock = useRef(false);           // cegah klik ganda sebelum state sempat berubah
  const requestId = useRef<string>(''); // kunci idempotensi: sama untuk setiap percobaan pada satu transaksi

  const isAdminLike = canEditTax;        // Super Admin / Admin: boleh atur pajak & diskon bebas (0-100)
  const discCap = isAdminLike ? 100 : maxDiscountPercent;

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true); setErr('');
      try {
        const r = await fetch(`/api/pos/catalog?branch=${branchId}&q=${encodeURIComponent(q)}&cat=${cat}`, { signal: ctrl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Gagal memuat produk');
        setItems(j.items); setCats(j.categories);
      } catch (e) { if ((e as Error).name !== 'AbortError') setErr((e as Error).message); }
      finally { setLoading(false); }
    }, q ? 250 : 0);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [branchId, q, cat, refresh]);

  const inCart = (pid: string) => cart.filter((l) => l.product_id === pid).reduce((a, l) => a + l.qty, 0);

  const add = (it: Item) => {
    if (!it.price || it.price <= 0) return;
    if (it.available - inCart(it.id) <= 0) return;
    setCart((c) => {
      if (it.tracking === 'serialized') {
        const used = new Set(c.filter((l) => l.product_id === it.id).map((l) => l.unit_id));
        const pref = it.matched_unit_id && !used.has(it.matched_unit_id) ? it.units.find((u) => u.id === it.matched_unit_id) : undefined;
        const u = pref ?? it.units.find((x) => !used.has(x.id));
        if (!u) return c;
        return [...c, { key: u.id, product_id: it.id, name: it.name, sku: it.sku, image_url: it.image_url, tracking: 'serialized', unit_id: u.id, unit_code: u.code, qty: 1, price: it.price ?? 0, max: 1 }];
      }
      const ex = c.find((l) => l.product_id === it.id);
      if (ex) return c.map((l) => (l === ex ? { ...l, qty: Math.min(l.qty + 1, it.available) } : l));
      return [...c, { key: it.id, product_id: it.id, name: it.name, sku: it.sku, image_url: it.image_url, tracking: 'quantity', qty: 1, price: it.price ?? 0, max: it.available }];
    });
  };
  const patch = (key: string, p: Partial<Line>) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const remove = (key: string) => setCart((c) => c.filter((l) => l.key !== key));
  const swapUnit = (l: Line, uid: string) => {
    const it = items.find((i) => i.id === l.product_id); const u = it?.units.find((x) => x.id === uid);
    if (u) setCart((c) => c.map((x) => (x.key === l.key ? { ...x, key: u.id, unit_id: u.id, unit_code: u.code } : x)));
  };

  // ===== Perhitungan (sama dengan database; database tetap menghitung ulang) =====
  const dPct = parsePercent(discStr), tPct = parsePercent(taxStr);
  const dErr = !validPercent(dPct) ? 'Diskon harus 0–100% (maks. 2 desimal).' : dPct > discCap ? (discCap === 0 ? 'Diskon hanya dapat diberikan oleh Admin.' : `Diskon maksimal ${discCap}% untuk peran Anda.`) : '';
  const tErr = !validPercent(tPct) ? 'Pajak harus 0–100% (maks. 2 desimal).' : !canEditTax && tPct !== taxPercent ? 'Tarif pajak mengikuti pengaturan toko.' : '';
  const sub = cart.reduce((a, l) => a + l.price * l.qty, 0);
  const t = useMemo(() => calcTotals(sub, dErr ? 0 : dPct, tErr ? 0 : tPct), [sub, dPct, tPct, dErr, tErr]);
  const percentOk = !dErr && !tErr;

  const tend = Number(tendered || 0);
  const change = tend - t.total;
  const quick = [...new Set([t.total, Math.ceil(t.total / 50000) * 50000, Math.ceil(t.total / 100000) * 100000, Math.ceil(t.total / 100000) * 100000 + 100000])].filter((n) => n >= t.total && n > 0);
  const refLen = ref.trim().length, noteLen = payNote.trim().length;
  const ready = !!method && cart.length > 0 && percentOk && (
    method === 'Tunai' ? tend >= t.total && t.total > 0
      : method === 'QRIS' ? verified
        : method === 'Transfer Bank' ? verified && banks.length > 0 && (refLen >= 3 || noteLen >= 3)
          : verified && refLen >= 4);
  const blockReason = !method ? 'Pilih metode pembayaran' : !percentOk ? 'Periksa diskon / pajak' :
    method === 'Tunai' ? 'Uang diterima belum cukup'
      : method === 'Transfer Bank' && banks.length === 0 ? 'Rekening tujuan belum diatur'
        : method === 'Transfer Bank' && refLen < 3 && noteLen < 3 ? 'Isi nomor referensi / keterangan'
          : method === 'Kartu Debit' && refLen < 4 ? 'Isi kode persetujuan EDC'
            : 'Centang verifikasi pembayaran';

  const openPay = () => {
    if (!requestId.current) requestId.current = crypto.randomUUID();
    setMethod(null); setTendered(''); setRef(''); setPayNote(''); setVerified(false); setPayErr(''); setPayOpen(true);
  };
  const pickMethod = (m: Method) => { setMethod(m); setVerified(false); setPayErr(''); };

  const resetSale = () => {
    setCart([]); setDiscStr(''); setTaxStr(String(taxPercent || 0)); setNotes(''); setCustomer({ name: '', phone: '', address: '' });
    setPayOpen(false); setMethod(null); requestId.current = ''; setRefresh((n) => n + 1);
  };

  const confirmPay = async () => {
    if (lock.current || !ready || !method) return;
    lock.current = true; setSubmitting(true); setPayErr('');
    try {
      const simNote = method === 'QRIS' && !qris.imageUrl ? 'Simulasi: QRIS toko belum dikonfigurasi' : '';
      const payload = {
        request_id: requestId.current, branch_id: branchId, customer, discount_percent: dPct, tax_percent: tPct, method,
        tendered: method === 'Tunai' ? tend : undefined, verified: method === 'Tunai' ? true : verified,
        reference: ref.trim() || undefined, pay_note: [payNote.trim(), simNote].filter(Boolean).join(' | ') || undefined, notes: notes.trim() || undefined,
        items: cart.map((l) => ({ product_id: l.product_id, unit_id: l.unit_id, qty: l.qty })),
      };
      const fd = new FormData(); fd.set('payload', JSON.stringify(payload));
      const res = await createSalePosAction(null, fd);
      if (res?.ok && res.data) {
        // Tampilkan sukses HANYA setelah server mengonfirmasi data tersimpan.
        setDone({ id: String(res.data.id), invoice_no: String(res.data.invoice_no), total: Number(res.data.total), method: String(res.data.method ?? method) });
        setPayOpen(false); setCart([]); requestId.current = '';
      } else setPayErr(res?.message || 'Transaksi gagal disimpan. Tidak ada pembayaran yang tercatat.');
    } catch {
      setPayErr('Koneksi terputus. Transaksi mungkin belum tersimpan: periksa Riwayat Transaksi sebelum mengulang. Menekan tombol lagi aman (tidak membuat transaksi ganda).');
    } finally { lock.current = false; setSubmitting(false); }
  };

  const cartCount = cart.reduce((a, l) => a + l.qty, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section aria-label="Daftar produk">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input className="input min-w-[200px] flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, SKU, atau nomor seri…" aria-label="Cari produk" autoFocus />
          <select className="input w-full sm:w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Kategori"><option value="">Semua kategori</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
        {err && <div role="alert" className="mb-3 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{err}</div>}
        {loading && items.length === 0 ? <p className="text-sm text-ink-500">Memuat produk…</p> : items.length === 0 ? <p className="rounded-lg border border-dashed border-ink-300 p-6 text-center text-sm text-ink-500">Tidak ada produk yang cocok.</p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((it) => {
              const left = it.available - inCart(it.id); const noPrice = !it.price || it.price <= 0; const out = left <= 0 || noPrice;
              return (
                <button key={it.id} type="button" onClick={() => add(it)} disabled={out} aria-label={`Tambah ${it.name}`}
                  className={`card overflow-hidden text-left transition ${out ? 'cursor-not-allowed opacity-50' : 'hover:border-brand hover:shadow'}`}>
                  <div className="relative"><Thumb src={it.image_url} name={it.name} />
                    <span className={`absolute right-1 top-1 rounded px-1.5 py-0.5 text-xs font-medium ${it.available === 0 ? 'bg-bad text-white' : 'bg-white/90 text-ink'}`}>{it.available === 0 ? 'Habis' : left <= 0 ? 'Di keranjang' : `Stok ${left}`}</span></div>
                  <div className="space-y-1 p-2">
                    <div className="line-clamp-2 text-sm font-medium leading-snug">{it.name}</div>
                    <div className="chip">{it.sku}</div>
                    <div className={`text-sm font-semibold ${noPrice ? 'text-warn' : 'text-brand'}`}>{noPrice ? 'Harga belum diisi' : rp(it.price ?? 0)}</div>
                  </div>
                </button>
              );
            })}
          </div>)}
      </section>

      <aside id="keranjang" aria-label="Keranjang" className="card scroll-mt-20 self-start p-3 lg:sticky lg:top-20">
        <h2 className="mb-2 font-semibold">Keranjang {cart.length > 0 && <span className="text-sm font-normal text-ink-500">({cart.length} item)</span>}</h2>
        {cart.length === 0 ? <p className="py-6 text-center text-sm text-ink-500">Pilih produk di daftar untuk menambahkannya ke keranjang.</p> : (
          <ul className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {cart.map((l) => {
              const it = items.find((i) => i.id === l.product_id);
              const free = it?.units.filter((u) => u.id === l.unit_id || !cart.some((x) => x.unit_id === u.id)) ?? [];
              return (
                <li key={l.key} className="rounded-md border border-ink-300/50 p-2 text-sm">
                  <div className="flex gap-2">
                    {l.image_url ? <img src={l.image_url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-brand-soft text-xs font-semibold text-brand">{l.name.slice(0, 2).toUpperCase()}</div>}
                    <div className="min-w-0 flex-1"><div className="line-clamp-2 font-medium leading-snug">{l.name}</div>
                      {l.tracking === 'serialized' && (free.length > 1 ? <select className="input mt-1 py-0.5 text-xs" value={l.unit_id} onChange={(e) => swapUnit(l, e.target.value)} aria-label="Pilih unit">{free.map((u) => <option key={u.id} value={u.id}>{u.code}{u.serial ? ` · SN ${u.serial}` : ''}</option>)}</select> : <span className="chip mt-1">{l.unit_code}</span>)}</div>
                    <button type="button" onClick={() => remove(l.key)} className="self-start rounded p-1 text-ink-500 hover:bg-bad-soft hover:text-bad" aria-label={`Hapus ${l.name}`}><X size={16} /></button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-xs text-ink-500">{rp(l.price)} × {l.qty}</div>
                    <div className="flex items-center gap-1" role="group" aria-label="Jumlah">
                      <button type="button" className="btn-ghost px-2 py-1" disabled={l.tracking === 'serialized' || l.qty <= 1} onClick={() => patch(l.key, { qty: l.qty - 1 })} aria-label="Kurangi">−</button>
                      <span className="w-7 text-center">{l.qty}</span>
                      <button type="button" className="btn-ghost px-2 py-1" disabled={l.tracking === 'serialized' || l.qty >= l.max} onClick={() => patch(l.key, { qty: l.qty + 1 })} aria-label="Tambah">+</button>
                    </div>
                    <div className="font-medium">{rp(l.price * l.qty)}</div>
                  </div>
                </li>);
            })}
          </ul>)}

        <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Pelanggan & catatan (opsional)</summary>
          <div className="mt-2 space-y-2">
            <input className="input" placeholder="Nama pelanggan" aria-label="Nama pelanggan" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} maxLength={120} />
            <input className="input" placeholder="No. telepon" aria-label="No. telepon" inputMode="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} maxLength={30} />
            <input className="input" placeholder="Alamat" aria-label="Alamat" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} maxLength={300} />
            <input className="input" placeholder="Catatan transaksi" aria-label="Catatan transaksi" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
          </div></details>

        <div className="mt-3 space-y-3 border-t border-dashed border-ink-300 pt-3 text-sm">
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="pos-disc" className="font-medium">Diskon (%)</label>
              <div className="flex items-center gap-1"><input id="pos-disc" className={`input w-24 py-1 text-right ${dErr ? 'border-bad' : ''}`} type="number" inputMode="decimal" min={0} max={discCap} step="0.01" placeholder="0" value={discStr} disabled={discCap === 0} onChange={(e) => setDiscStr(e.target.value)} aria-invalid={!!dErr} aria-describedby="pos-disc-msg" /><span aria-hidden>%</span></div>
            </div>
            {discCap > 0 && <div className="mt-1 flex flex-wrap justify-end gap-1">{[0, 5, 10, 15].filter((n) => n <= discCap).map((n) => <button key={n} type="button" className={`rounded border px-2 py-0.5 text-xs ${dPct === n && !dErr ? 'border-brand bg-brand-soft text-brand' : 'border-ink-300 hover:bg-canvas'}`} onClick={() => setDiscStr(n ? String(n) : '')}>{n === 0 ? 'Tanpa diskon' : `${n}%`}</button>)}</div>}
            <p id="pos-disc-msg" className={`mt-1 text-right text-xs ${dErr ? 'text-bad' : 'text-ink-500'}`} role={dErr ? 'alert' : undefined}>{dErr || (discCap === 0 ? 'Diskon hanya dapat diberikan oleh Admin.' : !isAdminLike ? `Maksimal ${discCap}% untuk peran Anda.` : '')}</p>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="pos-tax" className="font-medium">Pajak (%)</label>
              <div className="flex items-center gap-1"><input id="pos-tax" className={`input w-24 py-1 text-right ${tErr ? 'border-bad' : ''}`} type="number" inputMode="decimal" min={0} max={100} step="0.01" value={taxStr} readOnly={!canEditTax} onChange={(e) => setTaxStr(e.target.value)} aria-invalid={!!tErr} aria-describedby="pos-tax-msg" /><span aria-hidden>%</span></div>
            </div>
            {canEditTax && <div className="mt-1 flex flex-wrap justify-end gap-1">{[...new Set([0, taxPercent].filter((n) => n >= 0))].map((n) => <button key={n} type="button" className={`rounded border px-2 py-0.5 text-xs ${tPct === n && !tErr ? 'border-brand bg-brand-soft text-brand' : 'border-ink-300 hover:bg-canvas'}`} onClick={() => setTaxStr(String(n))}>{n === 0 ? 'Tanpa pajak' : `Tarif toko ${n}%`}</button>)}</div>}
            <p id="pos-tax-msg" className={`mt-1 text-right text-xs ${tErr ? 'text-bad' : 'text-ink-500'}`} role={tErr ? 'alert' : undefined}>{tErr || (!canEditTax ? 'Tarif pajak mengikuti pengaturan toko.' : '')}</p>
          </div>
          <dl className="space-y-1 rounded-md bg-canvas p-3">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{rp(t.subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Diskon ({dErr ? 0 : dPct}%)</dt><dd>− {rp(t.discount)}</dd></div>
            <div className="flex justify-between"><dt>Setelah diskon</dt><dd>{rp(t.afterDiscount)}</dd></div>
            <div className="flex justify-between"><dt>Pajak ({tErr ? 0 : tPct}%)</dt><dd>+ {rp(t.tax)}</dd></div>
            <div className="flex justify-between border-t border-ink-300/60 pt-1 text-lg font-semibold"><dt>Total pembayaran</dt><dd>{rp(t.total)}</dd></div>
          </dl>
        </div>
        <button type="button" className="btn-primary mt-3 w-full py-3 text-base" disabled={cart.length === 0 || !percentOk} onClick={openPay}>{cart.length === 0 ? 'Keranjang masih kosong' : `Bayar ${rp(t.total)}`}</button>
        {cart.length > 0 && <button type="button" className="mt-2 w-full text-sm text-ink-500 hover:text-bad" onClick={() => { if (window.confirm('Kosongkan keranjang?')) { setCart([]); setDiscStr(''); } }}>Kosongkan keranjang</button>}
      </aside>

      {/* Bilah ringkas di HP: total + lompat ke keranjang */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-ink-300/60 bg-white px-4 py-2 shadow-lg lg:hidden">
          <div className="text-sm"><div className="text-xs text-ink-500">{cartCount} barang</div><div className="font-semibold">{rp(t.total)}</div></div>
          <a href="#keranjang" className="btn-primary"><ShoppingCart size={16} aria-hidden /> Lihat keranjang</a>
        </div>)}
      {cart.length > 0 && <div className="h-14 lg:hidden" aria-hidden />}

      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Pembayaran">
          <div className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-4 sm:rounded-xl">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Pembayaran</h2><button type="button" className="rounded p-1 hover:bg-canvas disabled:opacity-40" onClick={() => setPayOpen(false)} disabled={submitting} aria-label="Tutup"><X size={18} /></button></div>
            <div className="mb-3 rounded-md bg-brand-soft p-3 text-center"><div className="text-xs text-ink-500">Total yang harus dibayar</div><div className="text-2xl font-bold text-brand">{rp(t.total)}</div>
              <div className="mt-0.5 text-xs text-ink-500">Subtotal {rp(t.subtotal)} · Diskon {rp(t.discount)} · Pajak {rp(t.tax)}</div></div>

            <div className="mb-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Metode pembayaran">
              {METHODS.map(({ key, label, hint, Icon }) => (
                <button key={key} type="button" role="radio" aria-checked={method === key} disabled={submitting} onClick={() => pickMethod(key)}
                  className={`flex flex-col items-start gap-0.5 rounded-md border p-2.5 text-left text-sm ${method === key ? 'border-brand bg-brand-soft ring-1 ring-brand' : 'border-ink-300 bg-white hover:bg-canvas'}`}>
                  <span className="flex items-center gap-1.5 font-medium"><Icon size={16} aria-hidden />{label}</span><span className="text-xs text-ink-500">{hint}</span>
                </button>))}
            </div>

            {method === 'Tunai' && (
              <div className="space-y-3">
                <label className="block"><span className="label">Uang diterima (Rp)</span><input className="input text-lg" type="number" inputMode="numeric" min={0} value={tendered} onChange={(e) => setTendered(e.target.value)} autoFocus /></label>
                <div className="flex flex-wrap gap-2">{quick.map((n) => <button key={n} type="button" className="btn-ghost py-1 text-sm" onClick={() => setTendered(String(n))}>{n === t.total ? 'Uang pas' : rp(n)}</button>)}</div>
                <dl className="space-y-1 rounded-md border border-ink-300/50 p-3 text-sm">
                  <div className="flex justify-between"><dt>Total pembayaran</dt><dd>{rp(t.total)}</dd></div>
                  <div className="flex justify-between"><dt>Uang diterima</dt><dd>{rp(tend)}</dd></div>
                  <div className={`flex justify-between text-base font-semibold ${change < 0 ? 'text-bad' : 'text-ok'}`}><dt>{change < 0 ? 'Kurang' : 'Kembalian'}</dt><dd>{rp(Math.abs(change))}</dd></div>
                </dl>
              </div>)}

            {method === 'QRIS' && (
              <div className="space-y-3">
                <div className="rounded-md border border-ink-300/60 p-3 text-center">
                  {qris.imageUrl ? <img src={qris.imageUrl} alt="Kode QRIS toko" className="mx-auto max-h-64 w-auto rounded object-contain" />
                    : <div className="mx-auto flex h-48 w-48 flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-warn/60 bg-warn-soft p-3 text-warn" role="note"><QrCode size={36} aria-hidden /><div className="text-sm font-semibold">QRIS toko belum diunggah</div><div className="text-xs">Mode simulasi — ini bukan QRIS aktif dan tidak dapat dipindai.</div></div>}
                  {qris.merchant && <div className="mt-2 text-sm font-medium">{qris.merchant}</div>}
                  <div className="mt-1 text-lg font-bold">{rp(t.total)}</div>
                  {!qris.imageUrl && canManageSettings && <Link href="/settings" className="mt-1 inline-block text-xs text-brand underline">Unggah QRIS di Pengaturan</Link>}
                </div>
                <ol className="list-decimal space-y-0.5 pl-5 text-sm text-ink-700">
                  <li>Minta pelanggan membuka aplikasi bank / e-wallet lalu memilih Pindai QR.</li>
                  <li>Pelanggan memindai kode di atas{qris.imageUrl ? ' dan memasukkan nominal sesuai total' : ''}.</li>
                  <li>Pastikan dana masuk pada aplikasi / mutasi QRIS toko.</li>
                </ol>
                <label className="block"><span className="label">Nomor referensi (opsional)</span><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={100} placeholder="mis. RRN / ID transaksi" /></label>
                <label className="flex items-start gap-2 rounded-md border border-ink-300/60 p-2.5 text-sm"><input type="checkbox" className="mt-0.5" checked={verified} onChange={(e) => setVerified(e.target.checked)} disabled={submitting} /><span>Saya sudah <b>memverifikasi</b> pembayaran {rp(t.total)} diterima. Aplikasi ini tidak memeriksa pembayaran QRIS secara otomatis.</span></label>
              </div>)}

            {method === 'Transfer Bank' && (
              <div className="space-y-3">
                {banks.length === 0 ? (
                  <div role="alert" className="rounded-md border border-warn/40 bg-warn-soft p-3 text-sm text-warn">Rekening tujuan belum diatur. {canManageSettings ? <Link href="/settings" className="underline">Isi di Pengaturan</Link> : 'Minta Super Admin mengisinya di menu Pengaturan.'}</div>
                ) : (
                  <ul className="space-y-2">{banks.map((b, i) => (
                    <li key={i} className="rounded-md border border-ink-300/60 p-3 text-sm"><div className="font-semibold">{b.bank}</div><div className="font-mono text-base tracking-wide">{b.number}</div><div className="text-ink-500">a.n. {b.holder}</div></li>))}</ul>)}
                <div className="rounded-md bg-canvas p-2 text-center text-sm">Nominal yang harus ditransfer: <b className="text-base">{rp(t.total)}</b></div>
                <label className="block"><span className="label">Nomor referensi transfer</span><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={100} placeholder="No. referensi pada bukti transfer" /></label>
                <label className="block"><span className="label">Keterangan bukti (opsional)</span><input className="input" value={payNote} onChange={(e) => setPayNote(e.target.value)} maxLength={200} placeholder="mis. a.n. pengirim, jam transfer" /></label>
                <p className="text-xs text-ink-500">Isi nomor referensi atau keterangan bukti (salah satu, min. 3 karakter).</p>
                <label className="flex items-start gap-2 rounded-md border border-ink-300/60 p-2.5 text-sm"><input type="checkbox" className="mt-0.5" checked={verified} onChange={(e) => setVerified(e.target.checked)} disabled={submitting || banks.length === 0} /><span>Saya sudah <b>memverifikasi</b> dana {rp(t.total)} masuk ke rekening toko (cek mutasi/rekening koran).</span></label>
              </div>)}

            {method === 'Kartu Debit' && (
              <div className="space-y-3">
                <ol className="list-decimal space-y-0.5 pl-5 text-sm text-ink-700">
                  <li>Masukkan nominal <b>{rp(t.total)}</b> pada mesin EDC bank toko.</li>
                  <li>Pelanggan menggesek/menempelkan kartu dan memasukkan PIN.</li>
                  <li>Tunggu mesin EDC menyatakan transaksi berhasil, lalu isi kode persetujuan dari struk EDC.</li>
                </ol>
                <p className="rounded-md bg-canvas p-2 text-xs text-ink-500">Aplikasi ini belum terhubung ke mesin EDC: pembayaran kartu tidak diproses di sini, hanya dicatat berdasarkan konfirmasi kasir.</p>
                <label className="block"><span className="label">Kode persetujuan / nomor referensi EDC</span><input className="input font-mono" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={100} autoComplete="off" /></label>
                <label className="flex items-start gap-2 rounded-md border border-ink-300/60 p-2.5 text-sm"><input type="checkbox" className="mt-0.5" checked={verified} onChange={(e) => setVerified(e.target.checked)} disabled={submitting} /><span>Mesin EDC sudah menyatakan transaksi <b>berhasil</b> sebesar {rp(t.total)}.</span></label>
              </div>)}

            {payErr && <div role="alert" className="mt-3 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">{payErr}</div>}
            {method && <p className="mt-3 text-xs text-ink-500">Status <b>Lunas</b> hanya dicatat setelah Anda mengonfirmasi pembayaran di bawah.</p>}
            <button type="button" className="btn-primary mt-3 w-full py-3 text-base" disabled={!ready || submitting} onClick={confirmPay}>
              {submitting ? 'Menyimpan transaksi…' : ready ? 'Konfirmasi pembayaran' : blockReason}
            </button>
          </div>
        </div>)}

      {done && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="pay-ok-title">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
            <CheckCircle2 size={56} className="mx-auto text-ok" aria-hidden />
            <h2 id="pay-ok-title" className="mt-2 text-2xl font-bold">Pembayaran Berhasil!</h2>
            <dl className="mt-4 space-y-1 rounded-md bg-canvas p-3 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-ink-500">No. invoice</dt><dd className="font-mono font-semibold">{done.invoice_no}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-500">Metode</dt><dd>{done.method}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-ink-500">Total pembayaran</dt><dd className="text-base font-bold">{rp(done.total)}</dd></div>
            </dl>
            <button type="button" className="btn-primary mt-4 w-full py-3" autoFocus onClick={() => router.push(`/sales/${done.id}`)}>Lihat Detail Transaksi</button>
            <button type="button" className="btn-ghost mt-2 w-full" onClick={() => { setDone(null); resetSale(); }}>Transaksi Baru</button>
          </div>
        </div>)}
      <span className="sr-only">Lokasi: {locationName}</span>
    </div>
  );
}
