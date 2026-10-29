const TZ = 'Asia/Jakarta';
const rp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('id-ID');
const dFmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: TZ });
const dtFmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });

export const rupiah = (v: number | string | null | undefined) => (v == null || v === '' ? '-' : rp.format(Number(v)));
export const nf = (v: number | string | null | undefined) => (v == null ? '-' : num.format(Number(v)));
export const fdate = (v: string | Date | null | undefined) => (v ? dFmt.format(new Date(v)) : '-');
export const fdatetime = (v: string | Date | null | undefined) => (v ? dtFmt.format(new Date(v)) : '-');

/** YYYY-MM-DD menurut WIB */
export function ymdWIB(d = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p;
}
export function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00+07:00'); d.setUTCDate(d.getUTCDate() + n); return ymdWIB(d);
}
export const startOfDay = (ymd: string) => `${ymd}T00:00:00+07:00`;
export const endOfDay = (ymd: string) => `${ymd}T23:59:59.999+07:00`;
export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Bersihkan kata kunci untuk filter PostgREST (.or / ilike) */
export const safeLike = (s: string) => s.replace(/[%*,()\\]/g, ' ').trim().slice(0, 80);

export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  const guarded = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;   // cegah formula injection di Excel
  return /[",\n\r]/.test(guarded) ? '"' + guarded.replace(/"/g, '""') + '"' : guarded;
}
export function toCsv(rows: Record<string, unknown>[], cols: string[]): string {
  return '\uFEFF' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(','))].join('\r\n');
}

/** Parser CSV (RFC 4180 sederhana) */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let cur: string[] = []; let f = ''; let q = false;
  const t = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === ';') { cur.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; cur.push(f); f = ''; if (cur.some((x) => x.trim() !== '')) rows.push(cur); cur = []; }
    else f += c;
  }
  cur.push(f); if (cur.some((x) => x.trim() !== '')) rows.push(cur);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
