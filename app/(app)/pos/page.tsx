import { requirePage } from '@/lib/context';
import { run } from '@/lib/db';
import { PageHeader, Empty } from '@/components/ui';
import { PosClient } from '@/components/PosClient';

export default async function PosPage() {
  const ctx = await requirePage('pos.sell');
  const st = await run<{ value: unknown } | null>('metode bayar', () => ctx.sb.from('app_settings').select('value').eq('key', 'payment_methods').maybeSingle());
  const methods = Array.isArray(st?.value) ? (st!.value as string[]) : ['Tunai', 'Non Tunai'];
  const branches = ctx.scopeBranches;
  if (branches.length === 0) return (<><PageHeader title="Penjualan" /><Empty title="Anda belum memiliki akses cabang" hint="Hubungi Super Admin." /></>);
  return (
    <>
      <PageHeader title="Penjualan (POS)" sub={ctx.scope === 'demo' ? 'MODE DEMO: transaksi tersimpan sebagai data demo.' : 'Transaksi nyata. Unit berseri otomatis berstatus Terjual dan tidak dapat dijual lagi.'} />
      <PosClient branches={branches} defaultBranch={ctx.branch?.id ?? branches[0].id} methods={methods} />
    </>
  );
}
