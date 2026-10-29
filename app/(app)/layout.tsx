import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { Shell, type NavItem } from '@/components/Shell';
import { ScopeControls } from '@/components/ScopeControls';
import { getContext } from '@/lib/context';
import { can, ROLE_LABEL, type Perm } from '@/lib/permissions';
import { logoutAction } from '../login/actions';
import { setScopeAction } from './actions';
import { run } from '@/lib/db';

const NAV: (NavItem & { perm: Perm })[] = [
  { href: '/', label: 'Dashboard', icon: 'dashboard', perm: 'dashboard.view' },
  { href: '/inventory', label: 'Inventory', icon: 'inventory', perm: 'inventory.view' },
  { href: '/pos', label: 'Penjualan (POS)', icon: 'pos', perm: 'pos.sell' },
  { href: '/sales', label: 'Riwayat Transaksi', icon: 'sales', perm: 'sales.view' },
  { href: '/service', label: 'Customer Service', icon: 'service', perm: 'service.view' },
  { href: '/warranty', label: 'Garansi', icon: 'warranty', perm: 'service.view' },
  { href: '/reports', label: 'Laporan', icon: 'reports', perm: 'reports.view' },
  { href: '/settings', label: 'Pengaturan', icon: 'settings', perm: 'settings.manage' },
];

async function Notifications({ ids, scope, role }: { ids: string[]; scope: 'real' | 'demo'; role: Parameters<typeof can>[0] }) {
  const ctx = (await getContext())!;
  const items: { href: string; text: string }[] = [];
  try {
  if (can(role, 'service.view')) {
    const rows = await run<{ id: string }[]>('notif tiket', () => ctx.sb.from('service_tickets').select('id').in('branch_id', ids).eq('data_origin', scope).in('status', ['baru', 'diproses', 'menunggu_spare_part', 'menunggu_pelanggan']).limit(200));
    if (rows.length) items.push({ href: '/service?status=open', text: `${rows.length} tiket layanan masih terbuka` });
  }
  if (can(role, 'inventory.view')) {
    const prods = await run<{ id: string; name: string; min_stock: number }[]>('notif stok', () => ctx.sb.from('products').select('id,name,min_stock').eq('archived', false).not('min_stock', 'is', null));
    if (prods.length) {
      const st = await run<{ product_id: string; available: number }[]>('notif stok2', () => ctx.sb.from('product_stock').select('product_id,available').in('branch_id', ids).in('product_id', prods.map((p) => p.id)));
      const sum = new Map<string, number>();
      st.forEach((s) => sum.set(s.product_id, (sum.get(s.product_id) ?? 0) + s.available));
      const low = prods.filter((p) => (sum.get(p.id) ?? 0) <= p.min_stock);
      if (low.length) items.push({ href: '/inventory?view=low', text: `${low.length} produk stok menipis` });
    }
  }
  } catch {
    // Notifikasi tidak boleh menjatuhkan seluruh aplikasi; tampilkan status gagal (bukan 'kosong').
    items.push({ href: '/', text: 'Notifikasi gagal dimuat. Muat ulang halaman.' });
  }
  return (
    <details className="relative">
      <summary className="relative cursor-pointer list-none rounded p-2 text-ink-500 hover:bg-canvas" aria-label={`Notifikasi (${items.length})`}>
        <Bell size={18} />{items.length > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-bad" />}
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-64 rounded-lg border border-ink-300/60 bg-white p-2 text-sm shadow-lg">
        {items.length === 0 ? <p className="px-2 py-3 text-ink-500">Tidak ada notifikasi.</p> : items.map((i) => <Link key={i.href} href={i.href} className="block rounded px-2 py-2 hover:bg-canvas">{i.text}</Link>)}
      </div>
    </details>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  if (!ctx) redirect('/login');
  if (!ctx.profile || !ctx.profile.active || !ctx.role) redirect('/login?e=noprofile');
  const nav = NAV.filter((n) => can(ctx.role, n.perm)).map(({ perm: _p, ...n }) => n);
  return (
    <Shell nav={nav} user={ctx.profile.full_name} role={ROLE_LABEL[ctx.role]} demo={ctx.scope === 'demo'} logout={logoutAction}
      controls={<ScopeControls branches={ctx.scopeBranches} branchId={ctx.branch?.id ?? null} scope={ctx.scope} scopeLocked={ctx.scopeLocked} action={setScopeAction} />}
      notifications={<Notifications ids={ctx.branchIds} scope={ctx.scope} role={ctx.role} />}>
      {children}
    </Shell>
  );
}
