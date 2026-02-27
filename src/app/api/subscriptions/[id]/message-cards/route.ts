import { eq, desc, and, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { messageCards, sources, favorites } from '@/lib/db/schema';

// GET /api/subscriptions/[id]/message-cards?offset=0&limit=50&sourceId=xxx
// Returns message cards for a subscription (newest first), with source title.
// Cards from disabled sources (isEnabled=false) are always excluded.
// Optional sourceId param filters to a single source.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));
    const sourceId = url.searchParams.get('sourceId') ?? undefined;

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
      .where(and(
        eq(messageCards.subscriptionId, id),
        eq(sources.isEnabled, true),
        ...(sourceId ? [eq(messageCards.sourceId, sourceId)] : []),
      ))
      .orderBy(desc(messageCards.publishedAt))
      .limit(limit)
      .offset(offset)
      .all();

    // Check favorite status for each card (only active favorites)
    if (rows.length > 0) {
      const cardIds = rows.map((r) => r.id);
      const favoritedIds = db
        .select({ originalCardId: favorites.originalCardId })
        .from(favorites)
        .where(and(
          inArray(favorites.originalCardId, cardIds),
          eq(favorites.isFavorite, true)
        ))
        .all()
        .map((f) => f.originalCardId);

      const favoritedSet = new Set(favoritedIds);
      rows.forEach((row) => {
        (row as Record<string, unknown>).isFavorite = favoritedSet.has(row.id);
      });
    }

    return Response.json({ data: rows, offset, limit });
  } catch (err) {
    console.error('[subscriptions/[id]/message-cards GET]', err);
    return Response.json({ error: 'Failed to load message cards' }, { status: 500 });
  }
}
