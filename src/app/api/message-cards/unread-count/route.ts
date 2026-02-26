import { isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { messageCards } from '@/lib/db/schema';

// GET /api/message-cards/unread-count → { count: number }
export async function GET() {
  try {
    const db = getDb();
    const row = db
      .select({ count: messageCards.id })
      .from(messageCards)
      .where(isNull(messageCards.readAt))
      .all();
    return Response.json({ count: row.length });
  } catch (err) {
    console.error('[message-cards/unread-count GET]', err);
    return Response.json({ error: 'Failed to get unread count' }, { status: 500 });
  }
}
