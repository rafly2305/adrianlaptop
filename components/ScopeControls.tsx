'use client';
import type { Branch } from '@/lib/context';

export function ScopeControls({ branches, branchId, scope, scopeLocked, action }: {
  branches: Branch[]; branchId: string | null; scope: 'real' | 'demo'; scopeLocked: boolean; action: (fd: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="flex items-center gap-2">
      {!scopeLocked && (
        <select name="scope" defaultValue={scope} aria-label="Jenis data" className="input w-auto py-1.5"
          onChange={(e) => { const f = e.currentTarget.form; if (f) { const b = f.elements.namedItem('branch') as HTMLSelectElement | null; if (b) b.value = 'all'; f.requestSubmit(); } }}>
          <option value="real">Data nyata</option><option value="demo">Data demo</option>
        </select>
      )}
      {scopeLocked && <input type="hidden" name="scope" value={scope} />}
      <select name="branch" defaultValue={branchId ?? 'all'} aria-label="Pilih cabang" className="input w-auto py-1.5" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {branches.length > 1 && <option value="all">Semua cabang</option>}
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_demo ? ' (Demo)' : ''}</option>)}
      </select>
    </form>
  );
}
