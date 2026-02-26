import { eq, desc, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { messageCards, sources } from '@/lib/db/schema';

// GET /api/subscriptions/[id]/message-cards?offset=0&limit=50
// Returns all message cards for a subscription (newest first), with source title
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));

    const db = getDb();

    const rows = db
      .select({
        id: messageCards.id,
        subscriptionId: messageCards.subscriptionId,
        sourceId: messageCards.sourceId,
        sourceTitle: sources.title,
        contentHash: messageCards.contentHash,
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
      .where(eq(messageCards.subscriptionId, id))
      .orderBy(desc(messageCards.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return Response.json({ data: rows, offset, limit });
  } catch (err) {
    console.error('[subscriptions/[id]/message-cards GET]', err);
    return Response.json({ error: 'Failed to load message cards' }, { status: 500 });
  }
}
