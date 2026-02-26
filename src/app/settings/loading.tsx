export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-6">
      <div className="h-8 w-16 bg-muted rounded animate-pulse mb-6" />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-4 h-24 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
