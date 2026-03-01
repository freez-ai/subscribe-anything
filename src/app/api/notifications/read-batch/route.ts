import { eq, and, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { notifications, subscriptions } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// POST /api/notifications/read-batch — mark multiple notifications as read
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const { ids } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: 'ids must be a non-empty array' }, { status: 400 });
    }

    const db = getDb();

    // Get user's subscription IDs for ownership check
    const userSubs = db.select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.userId))
      .all();

    if (userSubs.length === 0) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const userSubIds = userSubs.map(s => s.id);

    // Only update notifications that belong to the user's subscriptions
    db.update(notifications)
      .set({ isRead: true })
      .where(and(
        inArray(notifications.id, ids),
        inArray(notifications.subscriptionId, userSubIds),
      ))
      .run();

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[notifications/read-batch POST]', err);
    return Response.json({ error: 'Failed to mark notifications as read' }, { status: 500 });
  }
}
