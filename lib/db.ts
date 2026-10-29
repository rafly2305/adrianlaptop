import { AppError, isTransient, logServer } from './errors';

type Res<T> = { data: T | null; error: { message: string; code?: string } | null };

/**
 * Jalankan query. Error TIDAK pernah disamarkan menjadi data kosong:
 *  - gagal sementara (jaringan/timeout) => retry terbatas (default 2x, backoff singkat)
 *  - gagal lain => lempar AppError('db'), detail hanya ke log server.
 * Untuk mutasi gunakan { retries: 0 } agar tidak mengulang operasi non-idempoten.
 */
export async function run<T>(label: string, fn: () => PromiseLike<Res<T>>, opts: { retries?: number } = {}): Promise<T> {
  const max = opts.retries ?? 2;
  let last: unknown;
  for (let i = 0; i <= max; i++) {
    try {
      const { data, error } = await fn();
      if (!error) return data as T;
      last = error;
      if (!isTransient(error) || i === max) break;
    } catch (e) {
      last = e;
      if (!isTransient(e) || i === max) break;
    }
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  logServer(label, last);
  throw last instanceof AppError ? last : Object.assign(new AppError('db', 'Gagal memuat data dari database.', last), { cause: last });
}

/** Mutasi/RPC: tidak diulang otomatis; pesan error asli (kode RPC) dipertahankan untuk dipetakan ke pesan ramah. */
export async function mutate<T>(label: string, fn: () => PromiseLike<Res<T>>): Promise<T> {
  try {
    const { data, error } = await fn();
    if (error) { logServer(label, error); throw error; }
    return data as T;
  } catch (e) {
    if (!(e as { code?: string })?.code && !(e instanceof AppError)) logServer(label, e);
    throw e;
  }
}
