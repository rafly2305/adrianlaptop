'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAction, branchAllowed } from '@/lib/context';
import { mutate } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { parse, safe, uuid, type ActionState } from '@/lib/action';

export async function createOpnameAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const v = parse(z.object({ branch_id: uuid, note: z.string().max(300).optional() }), fd);
    if (!branchAllowed(ctx, v.branch_id)) throw new AppError('forbidden', 'Anda tidak memiliki akses ke cabang ini.');
    const id = await mutate<string>('opname_create', () => ctx.sb.rpc('opname_create', { p_branch: v.branch_id, p_note: v.note ?? null }));
    revalidatePath('/inventory/opname');
    redirect(`/inventory/opname/${id}`);
  });
}

/** Simpan hitungan fisik. intent=confirm: simpan lalu konfirmasi penyesuaian stok. */
export async function saveOpnameAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const id = parse(z.object({ id: uuid }), fd).id;
    const items: { id: string; physical: number; reason: string }[] = [];
    for (const raw of fd.getAll('item_id')) {
      const iid = String(raw);
      if (!z.string().uuid().safeParse(iid).success) continue;
      const physical = fd.get(`kind_${iid}`) === 'unit' ? (fd.get(`found_${iid}`) === 'on' ? 1 : 0) : Number(fd.get(`phys_${iid}`));
      if (!Number.isInteger(physical) || physical < 0) throw new AppError('validation', 'Jumlah fisik harus bilangan bulat ≥ 0.');
      items.push({ id: iid, physical, reason: String(fd.get(`why_${iid}`) ?? '').slice(0, 300) });
    }
    await mutate('opname_save', () => ctx.sb.rpc('opname_save', { p_id: id, p_items: items }));
    if (fd.get('intent') === 'confirm') {
      await mutate('opname_confirm', () => ctx.sb.rpc('opname_confirm', { p_id: id }));
      revalidatePath('/inventory', 'layout');
      return { ok: true, message: 'Penyesuaian dikonfirmasi. Stok sistem diperbarui dan riwayat tersimpan.' };
    }
    revalidatePath(`/inventory/opname/${id}`);
    return { ok: true, message: 'Hitungan disimpan.' };
  });
}

export async function cancelOpnameAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const ctx = await requireAction('inventory.write');
    const id = parse(z.object({ id: uuid }), fd).id;
    await mutate('opname_cancel', () => ctx.sb.rpc('opname_cancel', { p_id: id }));
    revalidatePath('/inventory/opname');
    redirect('/inventory/opname');
  });
}
