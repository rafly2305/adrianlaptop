export default function Loading() {
  return (
    <div className="space-y-3" role="status" aria-label="Memuat">
      <div className="h-7 w-48 animate-pulse rounded bg-ink-300/40" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-ink-300/30" />)}</div>
      <div className="h-64 animate-pulse rounded-lg bg-ink-300/30" />
    </div>
  );
}
