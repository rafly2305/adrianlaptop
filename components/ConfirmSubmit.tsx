'use client';
import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/** Tombol submit dengan konfirmasi; dapat membawa name/value (mis. intent=confirm). */
export function ConfirmSubmit({ children, confirm, name, value, className = 'btn-primary' }: { children: ReactNode; confirm: string; name?: string; value?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={className}
      onClick={(e) => { if (!window.confirm(confirm)) e.preventDefault(); }}>
      {pending ? 'Memproses…' : children}
    </button>
  );
}
