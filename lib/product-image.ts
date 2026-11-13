import 'server-only';
import { createAdminClient } from './supabase/admin';
import { AppError } from './errors';

const BUCKET = 'product-images';
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Unggah foto produk ke Supabase Storage (bucket publik) dan kembalikan URL publiknya. Hanya dari server. */
export async function uploadProductImage(file: File, sku: string): Promise<string> {
  const ext = TYPES[file.type];
  if (!ext) throw new AppError('validation', 'Format foto harus JPG, PNG, atau WebP.');
  if (file.size > 3 * 1024 * 1024) throw new AppError('validation', 'Ukuran foto maksimal 3 MB.');
  const admin = createAdminClient();
  const path = `${sku.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}-${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  let { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: file.type, upsert: false });
  if (error && /not found|bucket/i.test(error.message)) {
    await admin.storage.createBucket(BUCKET, { public: true });
    ({ error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: file.type, upsert: false }));
  }
  if (error) throw new AppError('db', 'Gagal mengunggah foto produk. Pastikan bucket “product-images” ada di Supabase Storage.', error);
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
