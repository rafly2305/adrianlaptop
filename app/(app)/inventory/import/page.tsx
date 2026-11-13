import Link from 'next/link';
import { requirePage } from '@/lib/context';
import { Card, PageHeader } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { importCsvAction } from '../actions';

export default async function ImportPage() {
  await requirePage('inventory.write');
  return (
    <>
      <PageHeader title="Impor CSV" actions={<Link href="/inventory" className="btn-ghost">Kembali</Link>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="1. Isi nomor seri unit yang sudah ada">
          <p className="mb-3 text-sm text-ink-500">Cocok untuk 49 unit Cidodol yang belum punya nomor seri. Kolom: <code className="chip">internal_asset_code,serial_number,verified</code> (verified: ya/tidak, opsional).</p>
          <pre className="mb-3 overflow-x-auto rounded bg-canvas p-2 text-xs">{`internal_asset_code,serial_number,verified\nUNIT-CDL-000001,PF1ABC23,ya`}</pre>
          <ActionForm action={importCsvAction} className="space-y-3">
            <input type="hidden" name="mode" value="serials" />
            <input type="file" name="file" accept=".csv,text/csv" required className="input" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="dry" defaultChecked /> Hanya validasi (jangan simpan)</label>
            <SubmitButton>Proses</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="2. Tambah unit baru">
          <p className="mb-3 text-sm text-ink-500">Kolom: <code className="chip">sku,branch_code,serial_number,condition,received_at,cost_price,notes</code>. Maks 500 baris. Nomor seri ganda ditolak.</p>
          <pre className="mb-3 overflow-x-auto rounded bg-canvas p-2 text-xs">{`sku,branch_code,serial_number,condition\nLTP-0003,CDL,SN12345,bekas_baik`}</pre>
          <ActionForm action={importCsvAction} className="space-y-3">
            <input type="hidden" name="mode" value="units" />
            <input type="file" name="file" accept=".csv,text/csv" required className="input" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="dry" defaultChecked /> Hanya validasi (jangan simpan)</label>
            <SubmitButton>Proses</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
