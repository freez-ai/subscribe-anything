import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { messageCards, favorites, subscriptions, sources } from '@/lib/db/schema';

// POST /api/message-cards/[id]/favorite — toggle favorite status
// Uses soft-delete: sets isFavorite flag instead of deleting
// Returns { ok: true, isFavorite: boolean }
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    // Check if already favorited (including soft-deleted ones)
    const existingFavorite = db
      .select()
      .from(favorites)
      .where(eq(favorites.originalCardId, id))
      .get();

    if (existingFavorite) {
      if (existingFavorite.isFavorite) {
        // Currently favorited: unfavorite by setting flag to false
        db.update(favorites)
          .set({ isFavorite: false })
          .where(eq(favorites.id, existingFavorite.id))
          .run();
        return Response.json({ ok: true, isFavorite: false });
      } else {
        // Soft-deleted: restore by setting flag to true and updating timestamp
        db.update(favorites)
          .set({ isFavorite: true, favoriteAt: new Date() })
          .where(eq(favorites.id, existingFavorite.id))
          .run();
        return Response.json({ ok: true, isFavorite: true });
      }
    }

    // Favorite: get card data and copy to favorites table
    const card = db
      .select({
        id: messageCards.id,
        title: messageCards.title,
        summary: messageCards.summary,
        thumbnailUrl: messageCards.thumbnailUrl,
        sourceUrl: messageCards.sourceUrl,
        publishedAt: messageCards.publishedAt,
        meetsCriteriaFlag: messageCards.meetsCriteriaFlag,
        criteriaResult: messageCards.criteriaResult,
        metricValue: messageCards.metricValue,
        subscriptionId: messageCards.subscriptionId,
        sourceId: messageCards.sourceId,
      })
      .from(messageCards)
      .where(eq(messageCards.id, id))
      .get();

    if (!card) {
      return Response.json({ error: 'Card not found' }, { status: 404 });
    }

    // Get subscription topic and source title for snapshot
    let subscriptionTopic: string | null = null;
    let sourceTitle: string | null = null;

    if (card.subscriptionId) {
      const sub = db
        .select({ topic: subscriptions.topic })
        .from(subscriptions)
        .where(eq(subscriptions.id, card.subscriptionId))
        .get();
      subscriptionTopic = sub?.topic ?? null;
    }

    if (card.sourceId) {
      const src = db
        .select({ title: sources.title })
        .from(sources)
        .where(eq(sources.id, card.sourceId))
        .get();
      sourceTitle = src?.title ?? null;
    }

    // Insert into favorites
    db.insert(favorites)
      .values({
        originalCardId: card.id,
        title: card.title,
        summary: card.summary,
        thumbnailUrl: card.thumbnailUrl,
        sourceUrl: card.sourceUrl,
        publishedAt: card.publishedAt,
        meetsCriteriaFlag: card.meetsCriteriaFlag,
        criteriaResult: card.criteriaResult,
        metricValue: card.metricValue,
        subscriptionTopic,
        sourceTitle,
        favoriteAt: new Date(),
        isFavorite: true,
      })
      .run();

    return Response.json({ ok: true, isFavorite: true });
  } catch (err) {
    console.error('[message-cards/[id]/favorite POST]', err);
    return Response.json({ error: 'Failed to toggle favorite' }, { status: 500 });
  }
}

// GET /api/message-cards/[id]/favorite — check if card is favorited
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const favorite = db
      .select()
      .from(favorites)
      .where(and(
        eq(favorites.originalCardId, id),
        eq(favorites.isFavorite, true)
      ))
      .get();

    return Response.json({ isFavorite: !!favorite });
  } catch (err) {
    console.error('[message-cards/[id]/favorite GET]', err);
    return Response.json({ error: 'Failed to check favorite status' }, { status: 500 });
  }
}
