import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { messageCards, subscriptions } from '@/lib/db/schema';

// POST /api/message-cards/read-all
// Without query params: marks ALL unread cards as read.
// With ?subscriptionId=xxx: marks only that subscription's unread cards as read.
export async function POST(req: Request) {
  try {
    const db = getDb();
    const now = new Date();
    const url = new URL(req.url);
    const subscriptionId = url.searchParams.get('subscriptionId');

    if (subscriptionId) {
      db.update(messageCards)
        .set({ readAt: now })
        .where(and(isNull(messageCards.readAt), eq(messageCards.subscriptionId, subscriptionId)))
        .run();

      db.update(subscriptions)
        .set({ unreadCount: 0, updatedAt: now })
        .where(eq(subscriptions.id, subscriptionId))
        .run();
    } else {
      db.update(messageCards)
        .set({ readAt: now })
        .where(isNull(messageCards.readAt))
        .run();

      db.update(subscriptions)
        .set({ unreadCount: 0, updatedAt: now })
        .run();
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[message-cards/read-all POST]', err);
    return Response.json({ error: 'Failed to mark all as read' }, { status: 500 });
  }
}
