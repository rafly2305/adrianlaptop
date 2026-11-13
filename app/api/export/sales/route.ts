import { NextResponse, type NextRequest } from 'next/server';
import { getContext } from '@/lib/context';
import { can } from '@/lib/permissions';
import { addDays, endOfDay, isYmd, startOfDay, toCsv, ymdWIB } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx || !can(ctx.role, 'reports.view')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const to = isYmd(sp.get('to')) ? sp.get('to')! : ymdWIB();
  const from = isYmd(sp.get('from')) ? sp.get('from')! : addDays(to, -29);
  const { data, error } = await ctx.sb.from('sales').select('invoice_no,sold_at,subtotal,discount,total,status,payment_status,payment_method,data_origin,branches(name),customers(name)')
    .eq('data_origin', ctx.scope).in('branch_id', ctx.branchIds).gte('sold_at', startOfDay(from)).lte('sold_at', endOfDay(to)).order('sold_at').limit(20000);
  if (error) { console.error('[adrian] export sales', error.code); return NextResponse.json({ error: 'Gagal mengekspor data.' }, { status: 502 }); }
  const rows = (data ?? []).map((s: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    invoice: s.invoice_no, waktu: s.sold_at, cabang: s.branches?.name, pelanggan: s.customers?.name, subtotal: s.subtotal, diskon: s.discount, total: s.total, status: s.status, pembayaran: s.payment_status, metode: s.payment_method, asal_data: s.data_origin }));
  return new NextResponse(toCsv(rows, ['invoice', 'waktu', 'cabang', 'pelanggan', 'subtotal', 'diskon', 'total', 'status', 'pembayaran', 'metode', 'asal_data']),
    { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="penjualan-${ctx.scope}-${from}_${to}.csv"` } });
}
