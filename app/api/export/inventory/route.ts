import { NextResponse } from 'next/server';
import { getContext } from '@/lib/context';
import { can } from '@/lib/permissions';
import { toCsv } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getContext();
  if (!ctx || !can(ctx.role, 'inventory.view')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { data, error } = await ctx.sb.from('inventory_units')
    .select('internal_asset_code,serial_number,serial_status,status,condition,received_at,cost_price,data_origin,branches(name),products(sku,name,brand,model,processor,ram_gb,storage)')
    .eq('data_origin', ctx.scope).in('branch_id', ctx.branchIds).order('internal_asset_code').limit(10000);
  if (error) { console.error('[adrian] export inventory', error.code); return NextResponse.json({ error: 'Gagal mengekspor data.' }, { status: 502 }); }
  const rows = (data ?? []).map((u: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    kode_unit: u.internal_asset_code, nomor_seri: u.serial_number, status_serial: u.serial_status, status: u.status, kondisi: u.condition,
    tanggal_masuk: u.received_at, harga_modal: u.cost_price, cabang: u.branches?.name, sku: u.products?.sku, produk: u.products?.name,
    merek: u.products?.brand, model: u.products?.model, prosesor: u.products?.processor, ram_gb: u.products?.ram_gb, storage: u.products?.storage, asal_data: u.data_origin,
  }));
  const cols = ['kode_unit', 'nomor_seri', 'status_serial', 'status', 'kondisi', 'tanggal_masuk', 'harga_modal', 'cabang', 'sku', 'produk', 'merek', 'model', 'prosesor', 'ram_gb', 'storage', 'asal_data'];
  return new NextResponse(toCsv(rows, cols), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="inventory-${ctx.scope}.csv"` } });
}
