import { NextResponse, type NextRequest } from 'next/server';
import { getContext, branchAllowed } from '@/lib/context';
import { can } from '@/lib/permissions';
import { safeLike } from '@/lib/format';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type P = { id: string; sku: string; name: string; default_price: number | null; image_url: string | null; tracking: 'serialized' | 'quantity'; category_id: string | null; categories: { name: string } | null };
type U = { id: string; product_id: string; internal_asset_code: string; serial_number: string | null };

export async function GET(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx || !can(ctx.role, 'pos.sell')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const branch = req.nextUrl.searchParams.get('branch') ?? '';
  const q = safeLike(req.nextUrl.searchParams.get('q') ?? '');
  const cat = req.nextUrl.searchParams.get('cat') ?? '';
  if (!UUID.test(branch) || !branchAllowed(ctx, branch)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    // Pencarian nomor seri / kode unit -> ikut menampilkan produk pemiliknya.
    let matched: U[] = [];
    if (q.length >= 2) {
      const { data, error } = await ctx.sb.from('inventory_units').select('id,product_id,internal_asset_code,serial_number')
        .eq('branch_id', branch).eq('status', 'available').eq('archived', false)
        .or(`serial_number.ilike.%${q}%,internal_asset_code.ilike.%${q}%`).limit(50);
      if (error) throw error;
      matched = (data ?? []) as U[];
    }
    let pq = ctx.sb.from('products').select('id,sku,name,default_price,image_url,tracking,category_id,categories(name)').eq('archived', false).order('name').limit(300);
    if (UUID.test(cat)) pq = pq.eq('category_id', cat);
    if (q.length >= 2) {
      const ids = [...new Set(matched.map((m) => m.product_id))];
      pq = pq.or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%${ids.length ? `,id.in.(${ids.join(',')})` : ''}`);
    }
    const [pr, cats] = await Promise.all([pq, ctx.sb.from('categories').select('id,name').order('name')]);
    if (pr.error) throw pr.error;
    const prods = (pr.data ?? []) as unknown as P[];
    const pids = prods.map((p) => p.id);
    const serIds = prods.filter((p) => p.tracking === 'serialized').map((p) => p.id);
    const qtyIds = prods.filter((p) => p.tracking === 'quantity').map((p) => p.id);
    const [ur, br] = await Promise.all([
      serIds.length ? ctx.sb.from('inventory_units').select('id,product_id,internal_asset_code,serial_number').eq('branch_id', branch).eq('status', 'available').eq('archived', false).in('product_id', serIds).order('internal_asset_code').limit(2000) : Promise.resolve({ data: [] as U[], error: null }),
      qtyIds.length ? ctx.sb.from('inventory_balances').select('product_id,qty').eq('branch_id', branch).in('product_id', qtyIds) : Promise.resolve({ data: [] as { product_id: string; qty: number }[], error: null }),
    ]);
    if (ur.error) throw ur.error;
    if (br.error) throw br.error;
    const unitsBy = new Map<string, U[]>();
    ((ur.data ?? []) as U[]).forEach((u) => { const a = unitsBy.get(u.product_id) ?? []; a.push(u); unitsBy.set(u.product_id, a); });
    const balBy = new Map(((br.data ?? []) as { product_id: string; qty: number }[]).map((b) => [b.product_id, b.qty]));
    const matchBy = new Map<string, string>();
    matched.forEach((m) => { if (!matchBy.has(m.product_id)) matchBy.set(m.product_id, m.id); });
    const items = prods.map((p) => {
      const units = (unitsBy.get(p.id) ?? []).map((u) => ({ id: u.id, code: u.internal_asset_code, serial: u.serial_number }));
      return {
        id: p.id, sku: p.sku, name: p.name, price: p.default_price, image_url: p.image_url, tracking: p.tracking, category: p.categories?.name ?? null,
        available: p.tracking === 'serialized' ? units.length : balBy.get(p.id) ?? 0, units, matched_unit_id: matchBy.get(p.id) ?? null,
      };
    }).filter((i) => pids.includes(i.id));
    // Produk yang ada stok didahulukan.
    items.sort((a, b) => Number(b.available > 0) - Number(a.available > 0) || a.name.localeCompare(b.name));
    return NextResponse.json({ items, categories: (cats.data ?? []) as { id: string; name: string }[] });
  } catch (e) {
    console.error('[adrian] pos catalog', (e as { code?: string })?.code);
    return NextResponse.json({ error: 'Gagal memuat produk. Coba lagi.' }, { status: 502 });
  }
}
