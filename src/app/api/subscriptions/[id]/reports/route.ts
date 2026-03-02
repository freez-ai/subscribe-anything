import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, analysisReports } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// GET /api/subscriptions/[id]/reports?starred=true
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    // Verify subscription belongs to user
    const sub = db.select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.userId)))
      .get();
    if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });

    const url = new URL(req.url);
    const starredOnly = url.searchParams.get('starred') === 'true';

    const conditions = [eq(analysisReports.subscriptionId, id)];
    if (starredOnly) {
      conditions.push(eq(analysisReports.isStarred, true));
    }

    const reports = db.select({
      id: analysisReports.id,
      title: analysisReports.title,
      description: analysisReports.description,
      cardCount: analysisReports.cardCount,
      isStarred: analysisReports.isStarred,
      status: analysisReports.status,
      error: analysisReports.error,
      createdAt: analysisReports.createdAt,
    })
      .from(analysisReports)
      .where(and(...conditions))
      .orderBy(desc(analysisReports.createdAt))
      .all();

    return Response.json(reports);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[reports GET]', err);
    return Response.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}
