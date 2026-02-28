import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, managedBuildLogs } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// GET /api/subscriptions/[id]/managed-progress
// Returns current managed creation status and logs.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    const sub = db
      .select({
        managedStatus: subscriptions.managedStatus,
        managedError: subscriptions.managedError,
      })
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.userId)))
      .get();

    if (!sub) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const logs = db
      .select()
      .from(managedBuildLogs)
      .where(eq(managedBuildLogs.subscriptionId, id))
      .orderBy(asc(managedBuildLogs.createdAt))
      .all();

    return Response.json({
      status: sub.managedStatus,
      error: sub.managedError,
      logs: logs.map((l) => ({
        id: l.id,
        step: l.step,
        level: l.level,
        message: l.message,
        payload: l.payload ? JSON.parse(l.payload) : null,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[managed-progress GET]', err);
    return Response.json({ error: 'Failed to get managed progress' }, { status: 500 });
  }
}
