export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="h-8 w-24 bg-muted rounded animate-pulse" />
        <div className="h-8 w-20 bg-muted rounded animate-pulse" />
      </div>
      <div className="flex flex-col gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-3 md:p-4 h-20 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
