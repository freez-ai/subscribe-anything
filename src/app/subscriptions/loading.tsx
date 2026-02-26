export default function Loading() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="hidden md:flex items-center justify-between mb-6">
        <div className="h-8 w-24 bg-muted rounded animate-pulse" />
        <div className="h-9 w-24 bg-muted rounded animate-pulse" />
      </div>
      <div className="h-8 w-24 bg-muted rounded animate-pulse mb-4 md:hidden" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 h-24 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
