'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { LayoutDashboard, Boxes, ShoppingCart, ReceiptText, LifeBuoy, ShieldCheck, BarChart3, Settings, PanelLeftClose, PanelLeftOpen, Menu, Search, LogOut, X } from 'lucide-react';

const ICONS = { dashboard: LayoutDashboard, inventory: Boxes, pos: ShoppingCart, sales: ReceiptText, service: LifeBuoy, warranty: ShieldCheck, reports: BarChart3, settings: Settings } as const;
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function Shell({ nav, user, role, demo, controls, notifications, logout, children }: {
  nav: NavItem[]; user: string; role: string; demo: boolean; controls: ReactNode; notifications: ReactNode; logout: () => Promise<void>; children: ReactNode;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  const Nav = ({ mini }: { mini: boolean }) => (
    <nav aria-label="Navigasi utama" className="mt-4 flex flex-col gap-0.5 px-2">
      {nav.map((n) => {
        const I = ICONS[n.icon];
        return (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)} title={n.label} aria-current={active(n.href) ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${active(n.href) ? 'bg-brand text-white' : 'text-ink-300 hover:bg-ink-700 hover:text-white'}`}>
            <I size={18} aria-hidden /> {!mini && <span>{n.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <div className="flex min-h-screen">
      <aside className={`hidden shrink-0 bg-ink text-white transition-[width] lg:block ${collapsed ? 'w-16' : 'w-60'}`}>
        <div className={`flex items-center px-3 ${collapsed ? 'h-16 justify-center' : 'h-24 justify-between'}`}>
          {!collapsed && (
            <Image src="/logo1.png" alt="Adrian Laptop Store" width={231} height={120} className="h-16 w-auto rounded-md bg-white px-2 py-1" priority />
          )}
          <button type="button" className="rounded p-2 text-ink-300 hover:bg-ink-700" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <Nav mini={collapsed} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/50" aria-label="Tutup menu" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64 bg-ink text-white">
            <div className="flex h-24 items-center justify-between px-3">
              <Image src="/logo.png" alt="Adrian Laptop Store" width={231} height={120} className="h-16 w-auto rounded-md bg-white px-2 py-1" />
              <button className="rounded p-2 hover:bg-ink-700" onClick={() => setOpen(false)} aria-label="Tutup"><X size={18} /></button>
            </div>
            <Nav mini={false} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {demo && <div className="bg-demo px-4 py-1.5 text-center text-xs font-medium text-white">MODE DEMO — data sintetis untuk pengujian, bukan data operasional nyata</div>}
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-ink-300/50 bg-white px-4 py-2">
          <button className="rounded p-2 hover:bg-canvas lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu size={20} /></button>
          <form action="/search" className="relative min-w-[160px] flex-1 sm:max-w-sm" role="search">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" aria-hidden />
            <input name="q" className="input pl-9" placeholder="Cari nomor seri, SKU, invoice, tiket…" aria-label="Pencarian global" />
          </form>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {controls}
            {notifications}
            <div className="hidden text-right leading-tight sm:block"><div className="text-sm font-medium">{user}</div><div className="text-xs text-ink-500">{role}</div></div>
            <form action={logout}><button className="rounded p-2 text-ink-500 hover:bg-canvas" aria-label="Keluar" title="Keluar"><LogOut size={18} /></button></form>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}