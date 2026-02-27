import { and, eq, isNull, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { messageCards, subscriptions } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// POST /api/message-cards/read-all
// Without query params: marks ALL unread cards as read.
// With ?subscriptionId=xxx: marks only that subscription's unread cards as read.
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const db = getDb();
    const now = new Date();
    const url = new URL(req.url);
    const subscriptionId = url.searchParams.get('subscriptionId');

    // Get user's subscription IDs
    const userSubs = db.select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.userId))
      .all();

    if (userSubs.length === 0) {
      return Response.json({ ok: true });
    }

    const userSubIds = userSubs.map(s => s.id);

    if (subscriptionId) {
      // Verify subscription belongs to user
      if (!userSubIds.includes(subscriptionId)) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }

      db.update(messageCards)
        .set({ readAt: now })
        .where(and(isNull(messageCards.readAt), eq(messageCards.subscriptionId, subscriptionId)))
        .run();

      db.update(subscriptions)
        .set({ unreadCount: 0, updatedAt: now })
        .where(eq(subscriptions.id, subscriptionId))
        .run();
    } else {
      // Mark all unread cards for user's subscriptions as read
      db.update(messageCards)
        .set({ readAt: now })
        .where(and(
          isNull(messageCards.readAt),
          inArray(messageCards.subscriptionId, userSubIds)
        ))
        .run();

      db.update(subscriptions)
        .set({ unreadCount: 0, updatedAt: now })
        .where(eq(subscriptions.userId, session.userId))
        .run();
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[message-cards/read-all POST]', err);
    return Response.json({ error: 'Failed to mark all as read' }, { status: 500 });
  }
}
