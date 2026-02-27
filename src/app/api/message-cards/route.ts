import { eq, desc, isNull, isNotNull, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { messageCards, sources, subscriptions } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// GET /api/message-cards?status=unread|read|all&subscriptionId=&limit=&offset=
// Returns message cards with source title and subscription topic joined
export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? 'unread';
    const subscriptionId = url.searchParams.get('subscriptionId');
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));

    const db = getDb();

    const conditions = [eq(subscriptions.userId, session.userId)];
    if (status === 'unread') conditions.push(isNull(messageCards.readAt));
    if (status === 'read') conditions.push(isNotNull(messageCards.readAt));
    if (subscriptionId) conditions.push(eq(messageCards.subscriptionId, subscriptionId));

    const orderCol = status === 'read' ? desc(messageCards.readAt) : desc(messageCards.createdAt);

    const rows = db
      .select({
        id: messageCards.id,
        subscriptionId: messageCards.subscriptionId,
        subscriptionTopic: subscriptions.topic,
        sourceId: messageCards.sourceId,
        sourceName: sources.title,
        title: messageCards.title,
        summary: messageCards.summary,
        thumbnailUrl: messageCards.thumbnailUrl,
        sourceUrl: messageCards.sourceUrl,
        publishedAt: messageCards.publishedAt,
        meetsCriteriaFlag: messageCards.meetsCriteriaFlag,
        criteriaResult: messageCards.criteriaResult,
        metricValue: messageCards.metricValue,
        readAt: messageCards.readAt,
        createdAt: messageCards.createdAt,
      })
      .from(messageCards)
      .innerJoin(sources, eq(messageCards.sourceId, sources.id))
      .innerJoin(subscriptions, eq(messageCards.subscriptionId, subscriptions.id))
      .where(and(...conditions))
      .orderBy(orderCol)
      .limit(limit)
      .offset(offset)
      .all();

    return Response.json({ data: rows, offset, limit });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[message-cards GET]', err);
    return Response.json({ error: 'Failed to load message cards' }, { status: 500 });
  }
}
