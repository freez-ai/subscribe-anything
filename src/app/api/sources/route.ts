import { eq, desc, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sources, subscriptions } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// GET /api/sources?subscriptionId=&page=&limit=
export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const url = new URL(req.url);
    const subscriptionId = url.searchParams.get('subscriptionId');
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
    const offset = (page - 1) * limit;

    const db = getDb();

    if (subscriptionId) {
      // Verify the subscription belongs to the user first
      const sub = db.select()
        .from(subscriptions)
        .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, session.userId)))
        .get();
      if (!sub) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
    }

    const whereCondition = subscriptionId
      ? and(eq(subscriptions.userId, session.userId), eq(sources.subscriptionId, subscriptionId))
      : eq(subscriptions.userId, session.userId);

    const rows = db
      .select({
        id: sources.id,
        subscriptionId: sources.subscriptionId,
        title: sources.title,
        description: sources.description,
        url: sources.url,
        script: sources.script,
        cronExpression: sources.cronExpression,
        isEnabled: sources.isEnabled,
        status: sources.status,
        lastRunAt: sources.lastRunAt,
        lastRunSuccess: sources.lastRunSuccess,
        lastError: sources.lastError,
        nextRunAt: sources.nextRunAt,
        totalRuns: sources.totalRuns,
        successRuns: sources.successRuns,
        itemsCollected: sources.itemsCollected,
        createdAt: sources.createdAt,
        updatedAt: sources.updatedAt,
      })
      .from(sources)
      .innerJoin(subscriptions, eq(sources.subscriptionId, subscriptions.id))
      .where(whereCondition)
      .orderBy(desc(sources.createdAt))
      .limit(limit)
      .offset(offset)
      .all();
    return Response.json({ data: rows, page, limit });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[sources GET]', err);
    return Response.json({ error: 'Failed to load sources' }, { status: 500 });
  }
}
