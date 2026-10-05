export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-4" role="status" aria-label="Loading poll">
      <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
