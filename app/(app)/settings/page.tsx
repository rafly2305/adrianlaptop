/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { Card, Field, PageHeader } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { saveBanksAction, saveQrisAction, saveSettingsAction } from './actions';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function SettingsPage() {
  const ctx = await requirePage('settings.manage');
  const settings = await run<Row[]>('setting', () => ctx.sb.from('app_settings').select('key,value'));
  const st = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const banks: { bank: string; number: string; holder: string }[] = Array.isArray(st.bank_accounts) ? st.bank_accounts : [];
  const qrisUrl = typeof st.qris_image_url === 'string' ? st.qris_image_url : '';

  return (
    <>
      <PageHeader title="Pengaturan" sub="Hanya Super Admin. Pengguna dan riwayat aktivitas punya menu sendiri." actions={<><Link className="btn-ghost" href="/users">User Management</Link><Link className="btn-ghost" href="/activity">Activity Log</Link></>} />
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-ink-300/50 bg-white p-4 text-sm">
        <MapPin size={18} className="shrink-0 text-brand" aria-hidden />
        <div><div className="font-medium">Lokasi operasional: {ctx.branch?.name ?? 'Cidodol'}{ctx.branch?.city ? `, ${ctx.branch.city}` : ''}</div><div className="text-ink-500">Aplikasi ini digunakan untuk satu lokasi. Seluruh data stok, penjualan, dan layanan dicatat pada lokasi ini.</div></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profil toko & penjualan" className="lg:col-span-2">
          <ActionForm action={saveSettingsAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama usaha"><input className="input" name="company_name" defaultValue={st.company_name ?? 'Adrian Laptop Store'} required /></Field>
            <Field label="Telepon toko"><input className="input" name="company_phone" defaultValue={st.company_phone ?? ''} inputMode="tel" /></Field>
            <Field label="Alamat toko (untuk struk & invoice)" className="sm:col-span-2"><input className="input" name="company_address" defaultValue={st.company_address ?? ''} /></Field>
            <Field label="Teks kaki struk" className="sm:col-span-2"><input className="input" name="receipt_footer" defaultValue={st.receipt_footer ?? ''} /></Field>
            <Field label="Tarif pajak (%)" hint="0 = tanpa pajak. Menjadi tarif tetap bagi Kasir; Admin dapat mengubahnya saat transaksi."><input className="input" type="number" step="0.01" min={0} max={100} name="tax_percent" defaultValue={st.tax_percent ?? 0} /></Field>
            <Field label="Batas diskon untuk Kasir (%)" hint="0 = hanya Admin yang boleh memberi diskon."><input className="input" type="number" step="0.01" min={0} max={100} name="max_discount_percent" defaultValue={st.max_discount_percent ?? 0} /></Field>
            <Field label="Masa garansi toko default (bulan)" hint="Kosong = belum ditetapkan; garansi tidak dibuat otomatis dan ditampilkan “belum diverifikasi”."><input className="input" type="number" min={0} max={120} name="store_warranty_months" defaultValue={st.store_warranty_months ?? ''} /></Field>
            <div className="self-end"><SubmitButton>Simpan pengaturan</SubmitButton></div>
          </ActionForm>
        </Card>

        <Card title="Pembayaran QRIS">
          <p className="mb-3 text-sm text-ink-500">Unggah gambar QRIS statis resmi toko dari bank/penyedia QRIS. Aplikasi menampilkannya apa adanya dan tidak memverifikasi pembayaran otomatis — kasir yang mengonfirmasi.</p>
          <ActionForm action={saveQrisAction} className="space-y-3">
            {qrisUrl ? <img src={qrisUrl} alt="QRIS toko saat ini" className="max-h-48 w-auto rounded border border-ink-300/50" /> : <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">Belum ada QRIS. Di POS akan tampil placeholder simulasi yang jelas.</p>}
            <Field label="Nama merchant (ditampilkan di POS)"><input className="input" name="qris_merchant_name" defaultValue={st.qris_merchant_name ?? ''} maxLength={100} /></Field>
            <Field label="Gambar QRIS" hint="JPG/PNG/WebP, maks. 3 MB. Kosongkan bila tidak diganti."><input className="input" type="file" name="qris_image" accept="image/jpeg,image/png,image/webp" /></Field>
            {qrisUrl && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remove" /> Hapus gambar QRIS saat ini</label>}
            <SubmitButton>Simpan QRIS</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Rekening tujuan Transfer Bank">
          <p className="mb-3 text-sm text-ink-500">Isi rekening resmi toko (maksimal 3). Kosongkan baris yang tidak dipakai. Selama belum ada rekening, metode Transfer Bank tidak dapat dikonfirmasi di POS.</p>
          <ActionForm action={saveBanksAction} className="space-y-3">
            {[0, 1, 2].map((i) => (
              <fieldset key={i} className="grid gap-2 rounded-md border border-ink-300/50 p-3 sm:grid-cols-3">
                <legend className="px-1 text-xs text-ink-500">Rekening {i + 1}</legend>
                <input className="input" name={`bank_${i + 1}`} placeholder="Nama bank" aria-label={`Nama bank ${i + 1}`} defaultValue={banks[i]?.bank ?? ''} maxLength={60} />
                <input className="input font-mono" name={`number_${i + 1}`} placeholder="Nomor rekening" aria-label={`Nomor rekening ${i + 1}`} inputMode="numeric" defaultValue={banks[i]?.number ?? ''} maxLength={30} />
                <input className="input" name={`holder_${i + 1}`} placeholder="Nama pemilik" aria-label={`Nama pemilik ${i + 1}`} defaultValue={banks[i]?.holder ?? ''} maxLength={100} />
              </fieldset>))}
            <SubmitButton>Simpan rekening</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
