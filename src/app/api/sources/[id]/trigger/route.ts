import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sources, subscriptions } from '@/lib/db/schema';
import { collect } from '@/lib/scheduler/collector';
import { clearRetry } from '@/lib/scheduler/retryManager';
import { requireAuth } from '@/lib/auth';

// POST /api/sources/[id]/trigger
// Manually trigger a collection run for a source.
// Returns immediately; collection runs in background.
// Frontend polls /api/sources/retry-states to track progress.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    // Verify source belongs to user via subscription
    const result = db.select()
      .from(sources)
      .innerJoin(subscriptions, eq(sources.subscriptionId, subscriptions.id))
      .where(and(eq(sources.id, id), eq(subscriptions.userId, session.userId)))
      .get();

    if (!result) {
      return Response.json({ error: 'Source not found' }, { status: 404 });
    }

    // Clear any pending retry before manual trigger
    clearRetry(id);

    // Fire and forget — frontend polls retry-states for progress
    collect(id).catch((err) =>
      console.error(`[Trigger] collect failed for ${id}:`, err)
    );

    return Response.json({ triggered: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[sources/[id]/trigger POST]', err);
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
