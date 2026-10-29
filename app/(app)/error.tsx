'use client';
import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[adrian] ui-error', error.digest); }, [error]);
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-bad/40 bg-white p-6 text-center">
      <h1 className="text-lg font-semibold text-bad">Data tidak dapat dimuat</h1>
      <p className="mt-2 text-sm text-ink-500">Terjadi gangguan saat mengambil data. Ini bukan berarti datanya kosong. Coba muat ulang; bila berulang, hubungi admin.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-ink-500">Kode: {error.digest}</p>}
      <button className="btn-primary mt-4" onClick={() => reset()}>Coba lagi</button>
    </div>
  );
}
