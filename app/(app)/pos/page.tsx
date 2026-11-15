import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { PageHeader, Empty } from '@/components/ui';
import { PosClient, type BankAccount } from '@/components/PosClient';

export default async function PosPage() {
  const ctx = await requirePage('pos.sell');
  const st = await run<{ key: string; value: unknown }[]>('pengaturan pos', () =>
    ctx.sb.from('app_settings').select('key,value').in('key', ['tax_percent', 'max_discount_percent', 'qris_image_url', 'qris_merchant_name', 'bank_accounts']));
  const get = (k: string) => st.find((s) => s.key === k)?.value;
  const tax = Number(get('tax_percent') ?? 0) || 0;
  const maxDisc = Number(get('max_discount_percent') ?? 0) || 0;
  const banks = (Array.isArray(get('bank_accounts')) ? (get('bank_accounts') as Partial<BankAccount>[]) : [])
    .filter((b) => b && b.bank && b.number && b.holder).map((b) => ({ bank: String(b.bank), number: String(b.number), holder: String(b.holder) }));
  const admin = ctx.role === 'super_admin' || ctx.role === 'branch_admin';
  if (!ctx.branch) return (<><PageHeader title="Penjualan (POS)" /><Empty title="Lokasi Cidodol tidak ditemukan atau Anda belum memiliki akses" hint="Hubungi Super Admin untuk memeriksa akun dan data lokasi." /></>);
  return (
    <>
      <PageHeader title="Penjualan (POS)" sub="Pilih produk, periksa subtotal, diskon, dan pajak, lalu pilih metode pembayaran. Unit berseri otomatis berstatus Terjual." />
      <PosClient branchId={ctx.branch.id} locationName={ctx.branch.name} taxPercent={tax} canEditTax={admin} maxDiscountPercent={maxDisc}
        canManageSettings={ctx.role === 'super_admin'} qris={{ imageUrl: String(get('qris_image_url') ?? ''), merchant: String(get('qris_merchant_name') ?? '') }} banks={banks} />
    </>
  );
}
