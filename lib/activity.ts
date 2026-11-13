import 'server-only';
import { createAdminClient } from './supabase/admin';
import { logServer } from './errors';

/**
 * Catat aktivitas ke audit_logs (dipakai untuk LOGIN, LOGOUT, dan aksi user management
 * yang dijalankan lewat service-role sehingga tidak tertangkap trigger database).
 * Tidak pernah melempar error: kegagalan pencatatan tidak boleh menggagalkan aksi utama.
 */
export async function logActivity(a: { actorId: string | null; action: string; entity: string; entityId?: string | null; branchId?: string | null; detail?: Record<string, unknown> }) {
  try {
    const { error } = await createAdminClient().from('audit_logs').insert({
      actor_id: a.actorId, branch_id: a.branchId ?? null, action: a.action, entity: a.entity, entity_id: a.entityId ?? null, detail: a.detail ?? {},
    });
    if (error) logServer('log_activity', error);
  } catch (e) { logServer('log_activity', e); }
}
