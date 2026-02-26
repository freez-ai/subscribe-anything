import { eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { messageCards, subscriptions } from '@/lib/db/schema';

// POST /api/message-cards/[id]/read — mark a single card as read
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const card = db
      .select({ id: messageCards.id, subscriptionId: messageCards.subscriptionId, readAt: messageCards.readAt })
      .from(messageCards)
      .where(eq(messageCards.id, id))
      .get();

    if (!card) return Response.json({ error: 'Not found' }, { status: 404 });

    // Only update if not already read
    if (!card.readAt) {
      const now = new Date();
      db.update(messageCards).set({ readAt: now }).where(eq(messageCards.id, id)).run();

      // Decrement subscription.unreadCount (floor at 0)
      db.update(subscriptions)
        .set({
          unreadCount: sql`MAX(0, ${subscriptions.unreadCount} - 1)`,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, card.subscriptionId))
        .run();
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[message-cards/[id]/read POST]', err);
    return Response.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}
