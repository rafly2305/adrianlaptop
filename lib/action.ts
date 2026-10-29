import { z } from 'zod';
import { AppError, friendly, isRedirect, logServer } from './errors';

export type ActionState = { ok: boolean; message?: string } | null;

/** Bungkus server action: tangkap error -> pesan ramah; biarkan redirect lewat. */
export async function safe(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try { return (await fn()) ?? null; }
  catch (e) {
    if (isRedirect(e)) throw e;
    if (!(e instanceof AppError)) logServer('action', e);
    return { ok: false, message: friendly(e) };
  }
}

export function parse<T extends z.ZodTypeAny>(schema: T, fd: FormData): z.infer<T> {
  const obj: Record<string, unknown> = {};
  fd.forEach((v, k) => { if (typeof v === 'string') obj[k] = v === '' ? undefined : v; });
  const r = schema.safeParse(obj);
  if (!r.success) throw new AppError('validation', r.error.issues[0]?.message ?? 'Data tidak valid.');
  return r.data;
}

export const uuid = z.string().uuid('ID tidak valid');
export const optUuid = z.string().uuid().optional();
