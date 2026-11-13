/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { PAY_STATUS } from '@/lib/labels';
import { fdate, fdatetime, rupiah } from '@/lib/format';
import { PrintButton } from '@/components/PrintButton';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PrintDoc({ params, searchParams }: { params: Promise<{ doc: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { doc, id } = await params;
  if (!['thermal', 'invoice', 'delivery'].includes(doc) || !UUID.test(id)) notFound();
  const ctx = await requirePage('sales.view');
  const sp = await searchParams;
  const sb = ctx.sb;
  const s = await run<Row | null>('transaksi', () => sb.from('sales').select('*, customers(name,phone,address), branches(name,city,code), profiles:cashier_id(full_name)').eq('id', id).maybeSingle());
  if (!s) notFound();
  const [allItems, pays, settings] = await Promise.all([
    run<Row[]>('item', () => sb.from('sale_items').select('id,qty,unit_price,discount,line_total,active,products(name,sku),inventory_units(internal_asset_code,serial_number)').eq('sale_id', id)),
    run<Row[]>('bayar', () => sb.from('payments').select('method,amount,paid_at,reference,tendered,change_amount,note').eq('sale_id', id).order('paid_at')),
    run<{ key: string; value: unknown }[]>('pengaturan', () => sb.from('app_settings').select('key,value').in('key', ['company_name', 'company_address', 'company_phone', 'receipt_footer'])),
  ]);
  const st = (k: string, d = '') => String(settings.find((x) => x.key === k)?.value ?? d);
  const company = st('company_name', 'Adrian Laptop Store'), address = st('company_address'), phone = st('company_phone'), footer = st('receipt_footer', 'Terima kasih');
  const items = allItems.some((i) => i.active) ? allItems.filter((i) => i.active) : allItems;
  const pay = pays[0];
  const cust = s.customers as Row | null;
  const w = one(sp.w) === '58' ? 58 : 80;
  const sj = `SJ-${String(s.invoice_no).replace(/^INV-/, '')}`;
  const shipTo = (one(sp.alamat) ?? '').slice(0, 300) || cust?.address || '';
  const Logo = ({ h }: { h: number }) => <img src="/logo1.png" alt={company} style={{ height: h, width: 'auto', display: 'block' }} />;
  const toolbar = (
    <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 12, background: '#f2f4f6', borderBottom: '1px solid #ddd' }}>
      <Link className="btn-ghost" href={`/sales/${id}`}>← Kembali</Link>
      <PrintButton label="Cetak" />
      {doc === 'thermal' && <><Link className="btn-ghost" href={`/print/thermal/${id}?w=58`}>Kertas 58mm</Link><Link className="btn-ghost" href={`/print/thermal/${id}?w=80`}>Kertas 80mm</Link></>}
      {doc === 'delivery' && <form method="get" style={{ display: 'flex', gap: 6 }}><input className="input" name="alamat" defaultValue={shipTo} placeholder="Alamat pengiriman (ubah bila berbeda)" style={{ width: 320 }} /><button className="btn-ghost">Terapkan</button></form>}
      <span style={{ fontSize: 12, color: '#5b6677' }}>Sidebar & tombol tidak ikut tercetak. Pilih “Simpan sebagai PDF” untuk PDF.</span>
    </div>
  );

  if (doc === 'thermal') {
    const fs = w === 58 ? 10 : 11.5;
    return (
      <div style={{ background: '#fff', minHeight: '100vh' }}>
        <style dangerouslySetInnerHTML={{ __html: `@page { size: ${w}mm auto; margin: 2mm; } @media print { html, body { background: #fff !important; } } .rcpt { width: ${w}mm; max-width: 100%; margin: 0 auto; padding: 4px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: ${fs}px; line-height: 1.35; color: #000; } .rcpt .r { display: flex; justify-content: space-between; gap: 6px; } .rcpt .c { text-align: center; } .rcpt hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }` }} />
        {toolbar}
        <div className="rcpt">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}><Logo h={w === 58 ? 34 : 44} /></div>
          <div className="c"><b>{company}</b><br />{s.branches?.name}{address && <><br />{address}</>}{phone && <><br />Telp. {phone}</>}</div>
          <hr />
          <div className="r"><span>No.</span><span>{s.invoice_no}</span></div>
          <div className="r"><span>Tanggal</span><span>{fdatetime(s.sold_at)}</span></div>
          <div className="r"><span>Kasir</span><span>{s.profiles?.full_name ?? '-'}</span></div>
          {cust?.name && <div className="r"><span>Pelanggan</span><span>{cust.name}</span></div>}
          <hr />
          {items.map((i) => (<div key={i.id} style={{ marginBottom: 3 }}>
            <div>{i.products?.name}</div>
            {i.inventory_units?.serial_number && <div style={{ fontSize: fs - 1.5 }}>SN: {i.inventory_units.serial_number}</div>}
            <div className="r"><span>{i.qty} x {rupiah(i.unit_price)}</span><span>{rupiah(Number(i.unit_price) * i.qty)}</span></div>
            {Number(i.discount) > 0 && <div className="r"><span>  Diskon</span><span>-{rupiah(i.discount)}</span></div>}
          </div>))}
          <hr />
          <div className="r"><span>Subtotal</span><span>{rupiah(s.subtotal)}</span></div>
          {Number(s.discount) > 0 && <div className="r"><span>Diskon</span><span>-{rupiah(s.discount)}</span></div>}
          {Number(s.tax) > 0 && <div className="r"><span>Pajak</span><span>{rupiah(s.tax)}</span></div>}
          <div className="r" style={{ fontWeight: 700, fontSize: fs + 2 }}><span>TOTAL</span><span>{rupiah(s.total)}</span></div>
          <hr />
          <div className="r"><span>Bayar ({pay?.method ?? s.payment_method ?? '-'})</span><span>{rupiah(pay?.tendered ?? pay?.amount ?? s.total)}</span></div>
          {pay?.change_amount != null && Number(pay.change_amount) > 0 && <div className="r"><span>Kembalian</span><span>{rupiah(pay.change_amount)}</span></div>}
          {pay?.reference && <div className="r"><span>Ref.</span><span>{pay.reference}</span></div>}
          <div className="r"><span>Status</span><span>{PAY_STATUS[s.payment_status]?.[0] ?? s.payment_status}</span></div>
          <hr />
          <div className="c">{footer}</div>
        </div>
      </div>
    );
  }

  const docTitle = doc === 'invoice' ? 'FAKTUR PENJUALAN' : 'SURAT JALAN';
  const th: React.CSSProperties = { border: '1px solid #999', padding: '6px 8px', background: '#f2f4f6', textAlign: 'left', fontSize: 12 };
  const td: React.CSSProperties = { border: '1px solid #bbb', padding: '6px 8px', fontSize: 12, verticalAlign: 'top' };
  const sign = (label: string) => (<div style={{ textAlign: 'center', width: 180 }}><div>{label}</div><div style={{ height: 70 }} /><div style={{ borderTop: '1px solid #000', paddingTop: 2 }}>(............................)</div></div>);
  return (
    <div style={{ background: '#fff', minHeight: '100vh', color: '#111' }}>
      <style dangerouslySetInnerHTML={{ __html: `@page { size: A4; margin: 14mm; } @media print { html, body { background: #fff !important; } } .doc { max-width: 190mm; margin: 0 auto; padding: 16px; font-family: ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif; font-size: 13px; }` }} />
      {toolbar}
      <div className="doc">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderBottom: '2px solid #111', paddingBottom: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Logo h={56} /><div><b style={{ fontSize: 16 }}>{company}</b><div>{s.branches?.name}{s.branches?.city ? `, ${s.branches.city}` : ''}</div>{address && <div>{address}</div>}{phone && <div>Telp. {phone}</div>}</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 20, fontWeight: 700 }}>{docTitle}</div>
            {doc === 'invoice' ? <><div>No. {s.invoice_no}</div><div>Tanggal: {fdate(s.sold_at)}</div></> : <><div>No. {sj}</div><div>Invoice: {s.invoice_no}</div><div>Tanggal kirim: {fdate(s.sold_at)}</div></>}</div>
        </div>
        <div style={{ display: 'flex', gap: 24, margin: '12px 0' }}>
          <div style={{ flex: 1 }}><b>{doc === 'invoice' ? 'Kepada' : 'Penerima'}</b><div>{cust?.name ?? 'Pelanggan umum'}</div>{(doc === 'delivery' ? shipTo : cust?.address) && <div>{doc === 'delivery' ? shipTo : cust?.address}</div>}{cust?.phone && <div>Telp. {cust.phone}</div>}</div>
          {doc === 'invoice' && <div style={{ minWidth: 200 }}><div>Metode: {pay?.method ?? s.payment_method ?? '-'}</div><div>Status: <b>{PAY_STATUS[s.payment_status]?.[0] ?? s.payment_status}</b></div><div>Kasir: {s.profiles?.full_name ?? '-'}</div></div>}
        </div>
        {doc === 'invoice' ? (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>No</th><th style={th}>SKU</th><th style={th}>Nama barang</th><th style={{ ...th, textAlign: 'right' }}>Jml</th><th style={{ ...th, textAlign: 'right' }}>Harga</th><th style={{ ...th, textAlign: 'right' }}>Diskon</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead><tbody>
              {items.map((i, n) => (<tr key={i.id}><td style={td}>{n + 1}</td><td style={td}>{i.products?.sku}</td><td style={td}>{i.products?.name}{i.inventory_units && <div style={{ fontSize: 11, color: '#555' }}>{i.inventory_units.internal_asset_code}{i.inventory_units.serial_number ? ` · SN ${i.inventory_units.serial_number}` : ''}</div>}</td><td style={{ ...td, textAlign: 'right' }}>{i.qty}</td><td style={{ ...td, textAlign: 'right' }}>{rupiah(i.unit_price)}</td><td style={{ ...td, textAlign: 'right' }}>{rupiah(i.discount)}</td><td style={{ ...td, textAlign: 'right' }}>{rupiah(i.line_total)}</td></tr>))}
            </tbody></table>
            <div style={{ marginLeft: 'auto', width: 260, marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{rupiah(s.subtotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Diskon</span><span>- {rupiah(s.discount)}</span></div>
              {Number(s.tax) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Pajak</span><span>{rupiah(s.tax)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: '1px solid #000', marginTop: 4, paddingTop: 4 }}><span>Total</span><span>{rupiah(s.total)}</span></div>
              {pay?.tendered != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Dibayar</span><span>{rupiah(pay.tendered)}</span></div>}
              {pay?.change_amount != null && Number(pay.change_amount) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Kembalian</span><span>{rupiah(pay.change_amount)}</span></div>}
            </div>
            {s.notes && <p style={{ marginTop: 10 }}>Catatan: {s.notes}</p>}
            <p style={{ marginTop: 14, fontSize: 11, color: '#555' }}>Garansi mengikuti data garansi unit pada sistem. {footer}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>{sign('Hormat kami')}</div>
          </>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>No</th><th style={th}>Kode / SKU</th><th style={th}>Nama barang</th><th style={{ ...th, textAlign: 'right' }}>Jumlah</th><th style={th}>Keterangan</th></tr></thead><tbody>
              {items.map((i, n) => (<tr key={i.id}><td style={td}>{n + 1}</td><td style={td}>{i.products?.sku}</td><td style={td}>{i.products?.name}</td><td style={{ ...td, textAlign: 'right' }}>{i.qty}</td><td style={td}>{i.inventory_units ? `${i.inventory_units.internal_asset_code}${i.inventory_units.serial_number ? ` · SN ${i.inventory_units.serial_number}` : ''}` : ''}</td></tr>))}
            </tbody></table>
            <p style={{ marginTop: 10, fontSize: 12 }}>Barang diterima dalam keadaan baik dan jumlah sesuai.</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30 }}>{sign('Petugas pengirim')}{sign('Penerima')}</div>
          </>
        )}
      </div>
    </div>
  );
}
