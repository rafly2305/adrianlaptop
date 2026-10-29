'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAction, branchAllowed } from '@/lib/context';
import { mutate } from '@/lib/db';
import { AppError, friendly } from '@/lib/errors';
import { parse, safe, uuid, type ActionState } from '@/lib/action';
import { parseCsv } from '@/lib/format';

const COND = z.enum(['baru', 'bekas_baik', 'bekas_cukup', 'perlu_perbaikan', 'belum_diperiksa']);
const num = z.coerce.number().min(0, 'Nilai tidak boleh negatif');
const ok = (message: string): ActionState => ({ ok: true, message });

function needBranch(ctx: Awaited<ReturnType<typeof requireAction>>, id: string) {
  if (!branchAllowed(ctx, id)) throw new AppError('forbidden', 'Anda tidak memiliki akses ke cabang ini.');
}

export async function receiveUnitAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ product_id: uuid, branch_id: uuid, serial: z.string().max(80).optional(), condition: COND, received_at: z.string().optional(), cost: num.optional(), notes: z.string().max(500).optional() }), fd);
    needBranch(ctx, v.branch_id);
    await mutate('receive_unit', () => ctx.sb.rpc('receive_unit', { p_product: v.product_id, p_branch: v.branch_id, p_serial: v.serial ?? null, p_condition: v.condition, p_received: v.received_at ?? null, p_cost: v.cost ?? null, p_notes: v.notes ?? null }));
    revalidatePath('/inventory');
    return ok('Unit berhasil diterima.');
  });
}

export async function receiveBulkAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ product_id: uuid, branch_id: uuid, serials: z.string().min(1, 'Isi minimal satu nomor seri'), condition: COND }), fd);
    needBranch(ctx, v.branch_id);
    const list = v.serials.split(/\r?\n/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (list.length > 200) throw new AppError('validation', 'Maksimal 200 nomor seri per input.');
    const dup = list.filter((s, i) => list.indexOf(s) !== i);
    if (dup.length) throw new AppError('validation', `Nomor seri ganda dalam input: ${[...new Set(dup)].slice(0, 5).join(', ')}`);
    const { data: exist, error } = await ctx.sb.from('inventory_units').select('serial_number').in('serial_number', list);
    if (error) throw error;
    if (exist?.length) throw new AppError('validation', `Sudah terdaftar di database: ${exist.slice(0, 5).map((e) => e.serial_number).join(', ')}. Tidak ada unit yang disimpan.`);
    let done = 0; const failed: string[] = [];
    for (const s of list) {
      try { await mutate('receive_unit(bulk)', () => ctx.sb.rpc('receive_unit', { p_product: v.product_id, p_branch: v.branch_id, p_serial: s, p_condition: v.condition, p_received: null, p_cost: null, p_notes: null })); done++; }
      catch (e) { failed.push(`${s}: ${friendly(e)}`); }
    }
    revalidatePath('/inventory');
    return failed.length ? { ok: false, message: `${done} unit tersimpan, ${failed.length} gagal — ${failed.slice(0, 3).join('; ')}` } : ok(`${done} unit berhasil diterima.`);
  });
}

export async function receiveQtyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ product_id: uuid, branch_id: uuid, qty: z.coerce.number().int().min(1, 'Jumlah minimal 1'), reason: z.string().max(200).optional() }), fd);
    needBranch(ctx, v.branch_id);
    await mutate('receive_quantity', () => ctx.sb.rpc('receive_quantity', { p_product: v.product_id, p_branch: v.branch_id, p_qty: v.qty, p_reason: v.reason ?? null }));
    revalidatePath('/inventory');
    return ok('Stok bertambah.');
  });
}

export async function adjustQtyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ product_id: uuid, branch_id: uuid, delta: z.coerce.number().int().refine((n) => n !== 0, 'Selisih tidak boleh 0'), reason: z.string().min(3, 'Alasan wajib diisi').max(200) }), fd);
    needBranch(ctx, v.branch_id);
    await mutate('adjust_stock', () => ctx.sb.rpc('adjust_stock', { p_product: v.product_id, p_branch: v.branch_id, p_delta: v.delta, p_reason: v.reason }));
    revalidatePath('/inventory');
    return ok('Penyesuaian stok tersimpan dan tercatat di audit log.');
  });
}

export async function setUnitStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ unit_id: uuid, status: z.enum(['available', 'reserved', 'damaged', 'returned', 'in_warranty', 'archived']), reason: z.string().min(3, 'Alasan wajib diisi').max(200) }), fd);
    await mutate('set_unit_status', () => ctx.sb.rpc('set_unit_status', { p_unit: v.unit_id, p_status: v.status, p_reason: v.reason }));
    revalidatePath('/inventory', 'layout');
    return ok('Status unit diperbarui.');
  });
}

export async function updateUnitAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ unit_id: uuid, condition: COND, cost: num.optional(), store_warranty_months: z.coerce.number().int().min(0).max(120).optional(), mfr_until: z.string().optional(), notes: z.string().max(500).optional(), inspection_notes: z.string().max(1000).optional() }), fd);
    await mutate('update_unit_details', () => ctx.sb.rpc('update_unit_details', { p_unit: v.unit_id, p_condition: v.condition, p_cost: v.cost ?? null, p_store_warranty_months: v.store_warranty_months ?? null, p_mfr_until: v.mfr_until ?? null, p_notes: v.notes ?? null, p_inspection_notes: v.inspection_notes ?? null }));
    revalidatePath(`/inventory/units/${v.unit_id}`);
    return ok('Detail unit disimpan.');
  });
}

export async function setSerialAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ unit_id: uuid, serial: z.string().max(80).optional(), verified: z.string().optional() }), fd);
    await mutate('set_unit_serial', () => ctx.sb.rpc('set_unit_serial', { p_unit: v.unit_id, p_serial: v.serial ?? null, p_verified: v.verified === 'on' }));
    revalidatePath(`/inventory/units/${v.unit_id}`);
    return ok('Nomor seri disimpan.');
  });
}

export async function addInspectionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ unit_id: uuid, notes: z.string().max(1000).optional() }), fd);
    const items = ['layar', 'keyboard', 'touchpad', 'baterai', 'charger', 'port', 'wifi', 'kamera', 'speaker', 'storage'];
    const checklist = Object.fromEntries(items.map((k) => [k, fd.get(`chk_${k}`) === 'on']));
    await mutate('unit_inspections', () => ctx.sb.from('unit_inspections').insert({ unit_id: v.unit_id, checked_by: ctx.user.id, checklist, notes: v.notes ?? null }));
    revalidatePath(`/inventory/units/${v.unit_id}`);
    return ok('Catatan pemeriksaan tersimpan.');
  });
}

const productSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().min(2, 'SKU wajib diisi').max(40).regex(/^[A-Za-z0-9._-]+$/, 'SKU hanya huruf, angka, titik, minus, garis bawah'),
  name: z.string().min(2, 'Nama wajib diisi').max(200),
  brand: z.string().max(80).optional(), model: z.string().max(120).optional(),
  category_id: z.string().uuid('Pilih kategori'), tracking: z.enum(['serialized', 'quantity']),
  processor: z.string().max(120).optional(), ram_gb: z.coerce.number().int().min(1).max(512).optional(), storage: z.string().max(80).optional(),
  touchscreen: z.enum(['', 'ya', 'tidak']).optional(), min_stock: z.coerce.number().int().min(0).optional(), default_price: num.optional(),
  needs_verification: z.string().optional(),
});
export async function saveProductAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(productSchema, fd);
    const row = { sku: v.sku.toUpperCase(), name: v.name, brand: v.brand ?? null, model: v.model ?? null, category_id: v.category_id, tracking: v.tracking,
      processor: v.processor ?? null, ram_gb: v.ram_gb ?? null, storage: v.storage ?? null, touchscreen: v.touchscreen === 'ya' ? true : v.touchscreen === 'tidak' ? false : null,
      min_stock: v.min_stock ?? null, default_price: v.default_price ?? null, needs_verification: v.needs_verification === 'on' };
    let id = v.id;
    if (id) await mutate('update product', () => ctx.sb.from('products').update(row).eq('id', id!));
    else {
      const r = await mutate<{ id: string }>('insert product', () => ctx.sb.from('products').insert({ ...row, data_origin: 'real' }).select('id').single());
      id = r.id;
    }
    revalidatePath('/inventory');
    redirect(`/inventory/products/${id}`);
  });
}

export async function archiveProductAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ id: uuid, archive: z.enum(['1', '0']) }), fd);
    if (v.archive === '1') {
      const { count } = await ctx.sb.from('inventory_units').select('id', { count: 'exact', head: true }).eq('product_id', v.id).in('status', ['available', 'reserved', 'in_transit']).eq('archived', false);
      const { data: bal } = await ctx.sb.from('inventory_balances').select('qty').eq('product_id', v.id).gt('qty', 0);
      if ((count ?? 0) > 0 || (bal?.length ?? 0) > 0) throw new AppError('validation', 'Produk masih memiliki stok. Kosongkan atau pindahkan stok sebelum mengarsipkan.');
    }
    await mutate('archive product', () => ctx.sb.from('products').update({ archived: v.archive === '1' }).eq('id', v.id));
    revalidatePath('/inventory', 'layout');
    return ok(v.archive === '1' ? 'Produk diarsipkan.' : 'Produk diaktifkan kembali.');
  });
}

export async function createTransferAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ from: uuid, to: uuid, note: z.string().max(300).optional() }), fd);
    needBranch(ctx, v.from);
    const items: { product_id: string; unit_id?: string; qty?: number }[] = [];
    for (const u of fd.getAll('unit')) { const [pid, uid] = String(u).split(':'); if (pid && uid) items.push({ product_id: pid, unit_id: uid }); }
    fd.forEach((val, key) => { if (key.startsWith('qty_') && Number(val) > 0) items.push({ product_id: key.slice(4), qty: Math.floor(Number(val)) }); });
    if (!items.length) throw new AppError('validation', 'Pilih minimal satu unit atau isi jumlah aksesori.');
    await mutate('create_transfer', () => ctx.sb.rpc('create_transfer', { p_from: v.from, p_to: v.to, p_items: items, p_note: v.note ?? null }));
    revalidatePath('/inventory', 'layout');
    return ok('Transfer dibuat. Stok keluar dari cabang asal; cabang tujuan perlu menerima.');
  });
}
export async function receiveTransferAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ id: uuid }), fd);
    await mutate('receive_transfer', () => ctx.sb.rpc('receive_transfer', { p_id: v.id }));
    revalidatePath('/inventory', 'layout');
    return ok('Transfer diterima; stok cabang tujuan bertambah.');
  });
}
export async function cancelTransferAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ id: uuid, reason: z.string().min(3, 'Alasan wajib diisi') }), fd);
    await mutate('cancel_transfer', () => ctx.sb.rpc('cancel_transfer', { p_id: v.id, p_reason: v.reason }));
    revalidatePath('/inventory', 'layout');
    return ok('Transfer dibatalkan; stok dikembalikan ke cabang asal.');
  });
}

/** Impor CSV. mode=units: sku,branch_code,serial_number,condition,received_at,cost_price,notes
 *  mode=serials: internal_asset_code,serial_number (mengisi nomor seri unit yang sudah ada) */
export async function importCsvAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const mode = fd.get('mode') === 'serials' ? 'serials' : 'units';
    const dry = fd.get('dry') === 'on';
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw new AppError('validation', 'Pilih file CSV.');
    if (file.size > 1_000_000) throw new AppError('validation', 'File terlalu besar (maks 1 MB).');
    const rows = parseCsv(await file.text());
    if (!rows.length) throw new AppError('validation', 'File kosong atau header tidak terbaca.');
    if (rows.length > 500) throw new AppError('validation', 'Maksimal 500 baris per impor.');
    const errors: string[] = [];
    const serialsInFile = new Set<string>();
    rows.forEach((r, i) => {
      const s = (r.serial_number ?? '').trim().toUpperCase();
      if (s) { if (serialsInFile.has(s)) errors.push(`Baris ${i + 2}: nomor seri ganda di file (${s})`); serialsInFile.add(s); }
      if (mode === 'units' && (!r.sku || !r.branch_code)) errors.push(`Baris ${i + 2}: sku & branch_code wajib`);
      if (mode === 'serials' && (!r.internal_asset_code || !s)) errors.push(`Baris ${i + 2}: internal_asset_code & serial_number wajib`);
    });
    if (serialsInFile.size) {
      const { data: ex, error } = await ctx.sb.from('inventory_units').select('serial_number,internal_asset_code').in('serial_number', [...serialsInFile]);
      if (error) throw error;
      ex?.forEach((e) => {
        const mine = mode === 'serials' && rows.some((r) => r.internal_asset_code === e.internal_asset_code && (r.serial_number ?? '').toUpperCase() === e.serial_number);
        if (!mine) errors.push(`Nomor seri sudah terdaftar: ${e.serial_number}`);
      });
    }
    if (errors.length) return { ok: false, message: `Validasi gagal (${errors.length}): ${errors.slice(0, 4).join(' | ')}` };
    if (dry) return ok(`Validasi lolos: ${rows.length} baris siap diimpor (belum disimpan).`);

    let done = 0; const failed: string[] = [];
    if (mode === 'units') {
      const skus = [...new Set(rows.map((r) => r.sku.toUpperCase()))];
      const { data: prods } = await ctx.sb.from('products').select('id,sku,tracking').in('sku', skus);
      const pm = new Map((prods ?? []).map((p) => [p.sku, p]));
      for (const [i, r] of rows.entries()) {
        const p = pm.get(r.sku.toUpperCase()); const b = ctx.branches.find((x) => x.code === r.branch_code.toUpperCase());
        if (!p || p.tracking !== 'serialized') { failed.push(`Baris ${i + 2}: SKU tidak ditemukan/bukan berseri`); continue; }
        if (!b) { failed.push(`Baris ${i + 2}: cabang tidak dikenal`); continue; }
        try {
          await mutate('import receive_unit', () => ctx.sb.rpc('receive_unit', { p_product: p.id, p_branch: b.id, p_serial: r.serial_number || null, p_condition: ['baru', 'bekas_baik', 'bekas_cukup', 'perlu_perbaikan'].includes(r.condition) ? r.condition : 'belum_diperiksa', p_received: r.received_at || null, p_cost: r.cost_price ? Number(r.cost_price) : null, p_notes: r.notes || null }));
          done++;
        } catch (e) { failed.push(`Baris ${i + 2}: ${friendly(e)}`); }
      }
    } else {
      const codes = rows.map((r) => r.internal_asset_code);
      const { data: us } = await ctx.sb.from('inventory_units').select('id,internal_asset_code').in('internal_asset_code', codes);
      const um = new Map((us ?? []).map((u) => [u.internal_asset_code, u.id]));
      for (const [i, r] of rows.entries()) {
        const id = um.get(r.internal_asset_code);
        if (!id) { failed.push(`Baris ${i + 2}: kode unit tidak ditemukan`); continue; }
        try { await mutate('import set_unit_serial', () => ctx.sb.rpc('set_unit_serial', { p_unit: id, p_serial: r.serial_number, p_verified: ['1', 'ya', 'true', 'terverifikasi'].includes((r.verified ?? '').toLowerCase()) })); done++; }
        catch (e) { failed.push(`Baris ${i + 2}: ${friendly(e)}`); }
      }
    }
    revalidatePath('/inventory', 'layout');
    return failed.length ? { ok: false, message: `${done} baris berhasil, ${failed.length} gagal — ${failed.slice(0, 3).join(' | ')}` } : ok(`${done} baris berhasil diimpor.`);
  });
}
