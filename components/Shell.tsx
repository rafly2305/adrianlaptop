'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { LayoutDashboard, Boxes, ShoppingCart, ReceiptText, LifeBuoy, ShieldCheck, BarChart3, Settings, Users, ScrollText, Package, ChevronDown, PanelLeftClose, PanelLeftOpen, Menu, Search, LogOut, X } from 'lucide-react';

const ICONS = { dashboard: LayoutDashboard, inventory: Boxes, pos: ShoppingCart, sales: ReceiptText, service: LifeBuoy, warranty: ShieldCheck, reports: BarChart3, settings: Settings, users: Users, activity: ScrollText, products: Package } as const;
export type NavChild = { href: string; label: string; match?: string[] };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; match?: string[]; children?: NavChild[] };
export type NavGroup = { title: string; items: NavItem[] };

export function Shell({ nav, user, role, controls, notifications, logout, children }: {
  nav: NavGroup[]; user: string; role: string; controls: ReactNode; notifications: ReactNode; logout: () => Promise<void>; children: ReactNode;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const baseOf = (h: string) => h.split('?')[0];
  const hit = (m: string) => (m.startsWith('=') ? path === m.slice(1) : path === m || path.startsWith(m + '/'));
  const active = (href: string) => (baseOf(href) === '/' ? path === '/' : hit(baseOf(href)));
  const childActive = (c: NavChild) => path === baseOf(c.href) || (c.match ?? []).some(hit);
  const Nav = ({ mini }: { mini: boolean }) => (
    <nav aria-label="Navigasi utama" className="mt-2 flex flex-col px-2 pb-6">
      {nav.map((g) => (
        <div key={g.title}>
          {mini ? <div className="mx-3 my-2 border-t border-ink-700" /> : <div className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-300/70">{g.title}</div>}
          <div className="flex flex-col gap-0.5">
            {g.items.map((n) => {
              const I = ICONS[n.icon];
              const parentOn = n.children?.length ? n.children.some(childActive) : active(n.href) || (n.match ?? []).some(hit);
              if (n.children?.length && !mini) {
                return (
                  <details key={n.href} open={parentOn} className="group">
                    <summary className={`flex cursor-pointer list-none items-center gap-3 rounded-md px-3 py-2 text-sm ${parentOn ? 'bg-ink-700 text-white' : 'text-ink-300 hover:bg-ink-700 hover:text-white'}`}>
                      <I size={18} aria-hidden /> <span className="flex-1">{n.label}</span><ChevronDown size={14} aria-hidden className="transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-ink-700 pl-2">
                      {n.children.map((c) => (
                        <Link key={c.label} href={c.href} onClick={() => setOpen(false)} aria-current={childActive(c) ? 'page' : undefined}
                          className={`rounded-md px-3 py-1.5 text-sm ${childActive(c) ? 'bg-brand text-white' : 'text-ink-300 hover:bg-ink-700 hover:text-white'}`}>{c.label}</Link>
                      ))}
                    </div>
                  </details>
                );
              }
              return (
                <Link key={n.href} href={n.href} onClick={() => setOpen(false)} title={n.label} aria-current={parentOn ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${parentOn ? 'bg-brand text-white' : 'text-ink-300 hover:bg-ink-700 hover:text-white'}`}>
                  <I size={18} aria-hidden /> {!mini && <span>{n.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
  return (
    <div className="flex min-h-screen">
      <aside className={`sticky top-0 hidden h-screen shrink-0 overflow-y-auto bg-ink text-white transition-[width] lg:block ${collapsed ? 'w-16' : 'w-60'}`}>
        <div className={`flex items-center px-3 ${collapsed ? 'h-16 justify-center' : 'h-24 justify-between'}`}>
          {!collapsed && (
            <Image src="/logo1.png" alt="Adrian Laptop Store" width={2172} height={724} className="h-16 w-auto rounded-md bg-white px-2 py-1" priority />
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
          <aside className="relative h-full w-64 overflow-y-auto bg-ink text-white">
            <div className="flex h-24 items-center justify-between px-3">
              <Image src="/logo1.png" alt="Adrian Laptop Store" width={2172} height={724} className="h-16 w-auto rounded-md bg-white px-2 py-1" />
              <button className="rounded p-2 hover:bg-ink-700" onClick={() => setOpen(false)} aria-label="Tutup"><X size={18} /></button>
            </div>
            <Nav mini={false} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
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
