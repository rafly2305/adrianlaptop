import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Tone } from '@/lib/labels';

const TONE: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad',
  info: 'bg-brand-soft text-brand-dark', mute: 'bg-canvas text-ink-500 border border-ink-300/60', demo: 'bg-demo-soft text-demo',
};

export function Badge({ children, tone = 'mute' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>{children}</span>;
}
export function StatusBadge({ map, value }: { map: Record<string, [string, Tone]>; value: string | null | undefined }) {
  const [l, t] = (value && map[value]) || [value ?? '-', 'mute' as Tone];
  return <Badge tone={t}>{l}</Badge>;
}
/** Kode/serial: komponen identitas visual aplikasi */
export function Chip({ children }: { children: ReactNode }) { return <span className="chip">{children}</span>; }
export function DemoTag() { return <Badge tone="demo">DEMO</Badge>; }

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-xl font-semibold tracking-tight">{title}</h1>{sub && <p className="mt-0.5 text-sm text-ink-500">{sub}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Card({ title, actions, children, className = '' }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <div className="flex items-center justify-between border-b border-ink-300/40 px-4 py-3"><h2 className="font-semibold">{title}</h2>{actions}</div>}
      <div className="p-4">{children}</div>
    </section>
  );
}
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'warn' | 'bad' }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-ink-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : ''}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </div>
  );
}
export function Empty({ title, hint, action }: { title: string; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-300 bg-white px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return <div role="alert" className="rounded-lg border border-bad/40 bg-bad-soft px-4 py-3 text-sm text-bad">{message}</div>;
}
export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (<label className={`block ${className}`}><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}</label>);
}
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="card overflow-x-auto">{children}</div>;
}

export function Pagination({ page, pageSize, total, basePath, params }: { page: number; pageSize: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v && k !== 'page') sp.set(k, v); });
    sp.set('page', String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-ink-500">
      <span>{total === 0 ? 'Tidak ada data' : `Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} dari ${total}`}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="btn-ghost" href={href(page - 1)}>Sebelumnya</Link> : <span className="btn-ghost opacity-40">Sebelumnya</span>}
        <span className="px-2 py-2">{page} / {pages}</span>
        {page < pages ? <Link className="btn-ghost" href={href(page + 1)}>Berikutnya</Link> : <span className="btn-ghost opacity-40">Berikutnya</span>}
      </div>
    </div>
  );
}
export const pageNum = (v: string | string[] | undefined) => Math.max(1, parseInt(Array.isArray(v) ? v[0] : v ?? '1', 10) || 1);
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
