import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { OPNAME_STATUS } from '@/lib/labels';
import { fdatetime, nf } from '@/lib/format';
import { Badge, Card, Chip, PageHeader, StatusBadge, TableWrap } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { PrintButton } from '@/components/PrintButton';
import { ConfirmSubmit } from '@/components/ConfirmSubmit';
import { cancelOpnameAction, saveOpnameAction } from '../actions';

type It = { id: string; product_id: string; unit_id: string | null; system_qty: number; physical_qty: number | null; reason: string | null; products: { name: string; sku: string } | null; inventory_units: { internal_asset_code: string; serial_number: string | null } | null };

export default async function OpnameDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requirePage('inventory.write');
  const o = await run<{ id: string; number: string; status: string; note: string | null; created_at: string; confirmed_at: string | null; branches: { name: string } | null } | null>('opname', () => ctx.sb.from('stock_opnames').select('id,number,status,note,created_at,confirmed_at,branches(name)').eq('id', id).maybeSingle());
  if (!o) notFound();
  const items = await run<It[]>('item opname', () => ctx.sb.from('stock_opname_items').select('id,product_id,unit_id,system_qty,physical_qty,reason,products(name,sku),inventory_units(internal_asset_code,serial_number)').eq('opname_id', id).limit(3000));
  const draft = o.status === 'draft';
  const units = items.filter((i) => i.unit_id).sort((a, b) => (a.products?.name ?? '').localeCompare(b.products?.name ?? '') || (a.inventory_units?.internal_asset_code ?? '').localeCompare(b.inventory_units?.internal_asset_code ?? ''));
  const qtys = items.filter((i) => !i.unit_id).sort((a, b) => (a.products?.name ?? '').localeCompare(b.products?.name ?? ''));
  const diff = (i: It) => (i.physical_qty ?? i.system_qty) - i.system_qty;
  const minus = items.filter((i) => diff(i) < 0).reduce((a, i) => a + diff(i), 0), plus = items.filter((i) => diff(i) > 0).reduce((a, i) => a + diff(i), 0);
  const DiffBadge = ({ d }: { d: number }) => d === 0 ? <Badge tone="ok">Sesuai</Badge> : <Badge tone={d < 0 ? 'bad' : 'warn'}>{d > 0 ? `+${d} lebih` : `${d} kurang`}</Badge>;

  const body = (
    <>
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Card><div className="text-xs text-ink-500">Selisih kurang</div><div className="text-xl font-semibold text-bad">{nf(minus)}</div></Card>
        <Card><div className="text-xs text-ink-500">Selisih lebih</div><div className="text-xl font-semibold text-warn">{nf(plus)}</div></Card>
        <Card><div className="text-xs text-ink-500">Item diperiksa</div><div className="text-xl font-semibold">{nf(items.length)}</div></Card>
      </div>
      <p className="mb-3 text-sm text-ink-500">Unit berseri: hilangkan centang pada unit yang <b>tidak ditemukan</b> secara fisik. Aksesori: isi jumlah fisik. Setiap selisih wajib diberi keterangan. Unit lebih yang ditemukan tidak bisa dibuat dari opname; catat lewat Barang Masuk.</p>
      <h3 className="mb-2 font-semibold">Aksesori (kuantitas)</h3>
      <TableWrap><table className="tbl"><thead><tr><th>Produk</th><th className="text-right">Stok sistem</th><th className="w-28 text-right">Stok fisik</th><th className="text-right">Selisih</th><th>Keterangan selisih</th></tr></thead><tbody>
        {qtys.map((i) => (<tr key={i.id}>
          <td>{i.products?.name} <Chip>{i.products?.sku}</Chip>{draft && <><input type="hidden" name="item_id" value={i.id} /><input type="hidden" name={`kind_${i.id}`} value="qty" /></>}</td>
          <td className="text-right">{nf(i.system_qty)}</td>
          <td className="text-right">{draft ? <input className="input w-24 py-1 text-right" type="number" min={0} name={`phys_${i.id}`} defaultValue={i.physical_qty ?? i.system_qty} aria-label="Stok fisik" /> : nf(i.physical_qty ?? 0)}</td>
          <td className="text-right"><DiffBadge d={diff(i)} /></td>
          <td>{draft ? <input className="input py-1" name={`why_${i.id}`} defaultValue={i.reason ?? ''} placeholder="mis. salah hitung / rusak" /> : i.reason}</td>
        </tr>))}
      </tbody></table></TableWrap>
      <h3 className="mb-2 mt-5 font-semibold">Unit berseri ({units.length})</h3>
      <TableWrap><table className="tbl"><thead><tr><th>Produk</th><th>Kode unit</th><th>Nomor seri</th><th className="text-center">Ditemukan</th><th className="text-right">Selisih</th><th>Keterangan selisih</th></tr></thead><tbody>
        {units.map((i) => (<tr key={i.id}>
          <td>{i.products?.name}{draft && <><input type="hidden" name="item_id" value={i.id} /><input type="hidden" name={`kind_${i.id}`} value="unit" /></>}</td>
          <td><Chip>{i.inventory_units?.internal_asset_code}</Chip></td><td className="font-mono text-xs">{i.inventory_units?.serial_number ?? '-'}</td>
          <td className="text-center">{draft ? <input type="checkbox" name={`found_${i.id}`} defaultChecked={(i.physical_qty ?? 1) === 1} aria-label="Ditemukan" /> : (i.physical_qty === 1 ? 'Ya' : 'Tidak')}</td>
          <td className="text-right"><DiffBadge d={diff(i)} /></td>
          <td>{draft ? <input className="input py-1" name={`why_${i.id}`} defaultValue={i.reason ?? ''} placeholder="wajib bila tidak ditemukan" /> : i.reason}</td>
        </tr>))}
      </tbody></table></TableWrap>
    </>
  );
  return (
    <>
      <PageHeader title={`Stok Opname ${o.number}`} sub={<span className="flex items-center gap-2"><StatusBadge map={OPNAME_STATUS} value={o.status} />{o.branches?.name} · dibuat {fdatetime(o.created_at)}{o.confirmed_at ? ` · selesai ${fdatetime(o.confirmed_at)}` : ''}</span>}
        actions={<><PrintButton label="Cetak laporan" /><Link className="btn-ghost no-print" href="/inventory/opname">Kembali</Link></>} />
      {draft ? (
        <>
          <ActionForm action={saveOpnameAction} className="space-y-3">
            <input type="hidden" name="id" value={o.id} />
            {body}
            <div className="no-print flex flex-wrap gap-2">
              <SubmitButton className="btn-ghost">Simpan hitungan</SubmitButton>
              <ConfirmSubmit name="intent" value="confirm" confirm="Konfirmasi penyesuaian? Stok sistem akan diubah sesuai hitungan fisik dan tidak dapat dibatalkan.">Konfirmasi penyesuaian stok</ConfirmSubmit>
            </div>
          </ActionForm>
          <ActionForm action={cancelOpnameAction} className="no-print mt-3"><input type="hidden" name="id" value={o.id} /><SubmitButton className="btn-ghost" confirm="Batalkan stok opname ini? Tidak ada perubahan stok.">Batalkan opname</SubmitButton></ActionForm>
        </>
      ) : body}
    </>
  );
}
