'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { LayoutDashboard, Boxes, ShoppingCart, ReceiptText, LifeBuoy, ShieldCheck, BarChart3, Settings, Users, ScrollText, Package, ChevronDown, PanelLeftClose, PanelLeftOpen, Menu, Search, LogOut, X, MapPin } from 'lucide-react';

const ICONS = { dashboard: LayoutDashboard, inventory: Boxes, pos: ShoppingCart, sales: ReceiptText, service: LifeBuoy, warranty: ShieldCheck, reports: BarChart3, settings: Settings, users: Users, activity: ScrollText, products: Package } as const;
export type NavChild = { href: string; label: string; match?: string[] };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; match?: string[]; children?: NavChild[] };
export type NavGroup = { title: string; items: NavItem[] };

/** Halaman dinamis yang tidak ada di menu: [awalan path, penunjuk]. Urutan: yang paling spesifik lebih dulu. */
const EXTRA: [RegExp, string[]][] = [
  [/^\/sales\/[^/]+$/, ['Riwayat Transaksi', 'Detail Transaksi']],
  [/^\/inventory\/products\/new$/, ['Produk', 'Tambah Produk']],
  [/^\/inventory\/products\/[^/]+$/, ['Produk', 'Detail Produk']],
  [/^\/inventory\/units\/[^/]+$/, ['Produk', 'Detail Unit & Nomor Seri']],
  [/^\/inventory\/import$/, ['Produk', 'Impor CSV']],
  [/^\/inventory$/, ['Produk', 'Unit & Nomor Seri']],
  [/^\/inventory\/opname\/[^/]+$/, ['Inventaris', 'Stok Opname', 'Detail']],
  [/^\/service\/new$/, ['Customer Service', 'Tiket Baru']],
  [/^\/service\/[^/]+$/, ['Customer Service', 'Detail Tiket']],
  [/^\/search$/, ['Pencarian']],
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

export function Shell({ nav, user, role, location, notifications, logout, children }: {
  nav: NavGroup[]; user: string; role: string; location: string; notifications: ReactNode; logout: () => Promise<void>; children: ReactNode;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const baseOf = (h: string) => h.split('?')[0];
  const hit = (m: string) => (m.startsWith('=') ? path === m.slice(1) : path === m || path.startsWith(m + '/'));
  const active = (href: string) => (baseOf(href) === '/' ? path === '/' : hit(baseOf(href)));
  const childActive = (c: NavChild) => path === baseOf(c.href) || (c.match ?? []).some(hit);

  // Tutup drawer mobile saat pindah halaman, dan kunci scroll latar saat drawer terbuka.
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open]);

  const crumbs = (() => {
    const extra = EXTRA.find(([re]) => re.test(path));
    if (extra) return extra[1];
    for (const g of nav) for (const n of g.items) {
      if (n.children?.length) { const c = n.children.find(childActive); if (c) return [n.label, c.label]; }
      else if (active(n.href) || (n.match ?? []).some(hit)) return [n.label];
    }
    return [];
  })();

  const Nav = ({ mini }: { mini: boolean }) => (
    <nav aria-label="Navigasi utama" className="mt-2 flex flex-col px-2 pb-4">
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
                        <Link key={c.label} href={c.href} aria-current={childActive(c) ? 'page' : undefined}
                          className={`rounded-md px-3 py-1.5 text-sm ${childActive(c) ? 'bg-brand text-white' : 'text-ink-300 hover:bg-ink-700 hover:text-white'}`}>{c.label}</Link>
                      ))}
                    </div>
                  </details>
                );
              }
              return (
                <Link key={n.href} href={n.href} title={n.label} aria-label={n.label} aria-current={parentOn ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${mini ? 'justify-center' : ''} ${parentOn ? 'bg-brand text-white' : 'text-ink-300 hover:bg-ink-700 hover:text-white'}`}>
                  <I size={18} aria-hidden /> {!mini && <span>{n.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  /** Informasi akun + Logout di dasar sidebar (desktop, tablet, dan drawer HP). */
  const Account = ({ mini }: { mini: boolean }) => (
    <div className="border-t border-ink-700 p-2">
      {mini ? (
        <div className="flex flex-col items-center gap-2 py-1">
          <div title={`${user} · ${role}`} aria-label={`${user}, ${role}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">{initials(user)}</div>
          <form action={logout}><button className="rounded-md p-2 text-ink-300 hover:bg-ink-700 hover:text-white" aria-label="Keluar" title="Keluar"><LogOut size={18} aria-hidden /></button></form>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <div aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">{initials(user)}</div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium text-white" title={user}>{user}</div>
            <div className="truncate text-xs text-ink-300">{role}</div>
          </div>
          <form action={logout}><button className="rounded-md p-2 text-ink-300 hover:bg-ink-700 hover:text-white" aria-label="Keluar" title="Keluar"><LogOut size={18} aria-hidden /></button></form>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-ink text-white transition-[width] lg:flex ${collapsed ? 'w-16' : 'w-60'}`}>
        <div className={`flex shrink-0 items-center px-3 ${collapsed ? 'h-16 justify-center' : 'h-24 justify-between'}`}>
          {!collapsed && (
            <Image src="/logo1.png" alt="Adrian Laptop Store" width={2172} height={724} className="h-16 w-auto rounded-md bg-white px-2 py-1" priority />
          )}
          <button type="button" className="rounded p-2 text-ink-300 hover:bg-ink-700" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto"><Nav mini={collapsed} /></div>
        <Account mini={collapsed} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu navigasi">
          <button className="absolute inset-0 bg-black/50" aria-label="Tutup menu" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-ink text-white">
            <div className="flex h-20 shrink-0 items-center justify-between px-3">
              <Image src="/logo1.png" alt="Adrian Laptop Store" width={2172} height={724} className="h-14 w-auto rounded-md bg-white px-2 py-1" />
              <button className="rounded p-2 hover:bg-ink-700" onClick={() => setOpen(false)} aria-label="Tutup menu"><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto"><Nav mini={false} /></div>
            <Account mini={false} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-ink-300/50 bg-white px-3 py-2 sm:gap-3 sm:px-4">
          <button className="rounded p-2 hover:bg-canvas lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu size={20} /></button>
          <form action="/search" className="relative min-w-0 flex-1 sm:max-w-sm" role="search">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" aria-hidden />
            <input name="q" className="input pl-9" placeholder="Cari nomor seri, SKU, invoice…" aria-label="Pencarian global" />
          </form>
          <nav aria-label="Lokasi halaman" className="hidden min-w-0 flex-1 truncate text-sm text-ink-500 xl:block">
            {crumbs.map((c, i) => <span key={i}>{i > 0 && <span className="mx-1.5" aria-hidden>›</span>}<span className={i === crumbs.length - 1 ? 'font-medium text-ink' : ''}>{c}</span></span>)}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 rounded-full border border-ink-300/60 bg-canvas px-3 py-1 text-sm font-medium" title="Lokasi operasional aktif">
              <MapPin size={14} className="text-brand" aria-hidden /><span>{location}</span>
            </div>
            {notifications}
          </div>
        </header>
        <main className="min-w-0 flex-1 p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
