'use client';
import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/lib/action';

export function SubmitButton({ children, className = 'btn-primary', confirm }: { children: ReactNode; className?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {pending ? 'Memproses…' : children}
    </button>
  );
}

/** Form + hasil aksi + toast. `resetOnSuccess` mengosongkan form setelah berhasil. */
export function ActionForm({ action, children, className = '', resetOnSuccess = false }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>; children: ReactNode; className?: string; resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const [toast, setToast] = useState<ActionState>(null);
  useEffect(() => {
    if (!state) return;
    setToast(state);
    if (state.ok && resetOnSuccess) ref.current?.reset();
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [state, resetOnSuccess]);
  return (
    <>
      <form ref={ref} action={formAction} className={className}>{children}</form>
      {toast?.message && (
        <div role={toast.ok ? 'status' : 'alert'} aria-live="polite"
          className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg ${toast.ok ? 'bg-ok' : 'bg-bad'}`}>
          {toast.message}
        </div>
      )}
    </>
  );
}
