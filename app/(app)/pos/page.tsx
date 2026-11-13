import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { PageHeader, Empty } from '@/components/ui';
import { PosClient } from '@/components/PosClient';

export default async function PosPage() {
  const ctx = await requirePage('pos.sell');
  const st = await run<{ key: string; value: unknown }[]>('pengaturan pos', () => ctx.sb.from('app_settings').select('key,value').in('key', ['payment_methods', 'tax_percent']));
  const get = (k: string) => st.find((s) => s.key === k)?.value;
  const all = Array.isArray(get('payment_methods')) ? (get('payment_methods') as string[]) : ['Tunai', 'Transfer Bank', 'QRIS', 'Kartu Debit/Kredit', 'E-Wallet'];
  const nonCash = all.filter((m) => m.toLowerCase() !== 'tunai');
  const tax = Number(get('tax_percent') ?? 0) || 0;
  const branches = ctx.scopeBranches;
  if (branches.length === 0) return (<><PageHeader title="Penjualan" /><Empty title="Anda belum memiliki akses cabang" hint="Hubungi Super Admin." /></>);
  return (
    <>
      <PageHeader title="Penjualan (POS)" sub="Pilih produk, periksa keranjang, lalu bayar. Unit berseri otomatis berstatus Terjual." />
      <PosClient branches={branches.map((b) => ({ id: b.id, name: b.name }))} defaultBranch={ctx.branch?.id ?? branches[0].id} nonCashMethods={nonCash.length ? nonCash : ['Transfer Bank']} taxPercent={tax} />
    </>
  );
}
