import { NextResponse, type NextRequest } from 'next/server';
import { getContext, branchAllowed } from '@/lib/context';
import { can } from '@/lib/permissions';
import { safeLike } from '@/lib/format';

export const dynamic = 'force-dynamic';

type U = { id: string; product_id: string; internal_asset_code: string; serial_number: string | null; products: { name: string; default_price: number | null } | null };
type B = { qty: number; product_id: string; products: { name: string; default_price: number | null; archived: boolean } | null };

export async function GET(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx || !can(ctx.role, 'pos.sell')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const branch = req.nextUrl.searchParams.get('branch') ?? '';
  const q = safeLike(req.nextUrl.searchParams.get('q') ?? '');
  if (!branchAllowed(ctx, branch)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    const { data: pr, error: e0 } = await ctx.sb.from('products').select('id').eq('archived', false).or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%`).limit(100);
    if (e0) throw e0;
    const pids = (pr ?? []).map((p) => p.id);
    const filter = `serial_number.ilike.%${q}%,internal_asset_code.ilike.%${q}%${pids.length ? `,product_id.in.(${pids.join(',')})` : ''}`;
    const [u, b] = await Promise.all([
      ctx.sb.from('inventory_units').select('id,product_id,internal_asset_code,serial_number,products(name,default_price)').eq('branch_id', branch).eq('status', 'available').eq('archived', false).or(filter).order('internal_asset_code').limit(25),
      pids.length ? ctx.sb.from('inventory_balances').select('qty,product_id,products(name,default_price,archived)').eq('branch_id', branch).gt('qty', 0).in('product_id', pids).limit(15) : Promise.resolve({ data: [] as B[], error: null }),
    ]);
    if (u.error) throw u.error;
    if (b.error) throw b.error;
    const results = [
      ...((u.data ?? []) as unknown as U[]).map((x) => ({ kind: 'unit' as const, product_id: x.product_id, unit_id: x.id, name: x.products?.name ?? '', code: x.internal_asset_code, serial: x.serial_number, price: x.products?.default_price ?? null })),
      ...((b.data ?? []) as unknown as B[]).filter((x) => !x.products?.archived).map((x) => ({ kind: 'qty' as const, product_id: x.product_id, name: x.products?.name ?? '', stock: x.qty, price: x.products?.default_price ?? null })),
    ];
    return NextResponse.json({ results });
  } catch (e) {
    console.error('[adrian] pos search', (e as { code?: string })?.code);
    return NextResponse.json({ error: 'Pencarian gagal. Coba lagi.' }, { status: 502 });
  }
}
