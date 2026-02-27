import { isNull, eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { messageCards, subscriptions } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// GET /api/message-cards/unread-count → { count: number }
export async function GET() {
  try {
    const session = await requireAuth();
    const db = getDb();
    const rows = db
      .select({ count: messageCards.id })
      .from(messageCards)
      .innerJoin(subscriptions, eq(messageCards.subscriptionId, subscriptions.id))
      .where(and(
        isNull(messageCards.readAt),
        eq(subscriptions.userId, session.userId)
      ))
      .all();
    return Response.json({ count: rows.length });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[message-cards/unread-count GET]', err);
    return Response.json({ error: 'Failed to get unread count' }, { status: 500 });
  }
}
