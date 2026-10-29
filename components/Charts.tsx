'use client';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const rp = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
const short = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)} jt` : v >= 1e3 ? `${Math.round(v / 1e3)} rb` : String(v));

export function SalesLine({ data }: { data: { label: string; total: number; count: number }[] }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Grafik omzet harian">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e8ee" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={short} width={48} />
          <Tooltip formatter={(v: number, n: string) => (n === 'total' ? [rp(v), 'Omzet'] : [v, 'Transaksi'])} />
          <Line type="monotone" dataKey="total" stroke="#2b4bd8" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarSimple({ data, money = false, label }: { data: { name: string; value: number }[]; money?: boolean; label: string }) {
  return (
    <div className="h-64 w-full" role="img" aria-label={label}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e8ee" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={money ? short : undefined} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
          <Tooltip formatter={(v: number) => (money ? rp(v) : v)} />
          <Bar dataKey="value" fill="#2b4bd8" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
