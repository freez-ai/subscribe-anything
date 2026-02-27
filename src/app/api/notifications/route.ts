import { eq, desc, and, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { notifications, subscriptions } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// GET /api/notifications?subscriptionId=&isRead=false
export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const url = new URL(req.url);
    const subscriptionId = url.searchParams.get('subscriptionId');
    const isReadParam = url.searchParams.get('isRead');

    const db = getDb();

    // Get user's subscription IDs
    const userSubs = db.select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.userId))
      .all();

    if (userSubs.length === 0) {
      return Response.json([]);
    }

    const userSubIds = userSubs.map(s => s.id);
    const conditions = [inArray(notifications.subscriptionId, userSubIds)];

    if (subscriptionId) {
      // Verify subscription belongs to user
      if (!userSubIds.includes(subscriptionId)) {
        return Response.json([]);
      }
      conditions.push(eq(notifications.subscriptionId, subscriptionId));
    }
    if (isReadParam === 'false') conditions.push(eq(notifications.isRead, false));

    const rows = db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(50)
      .all();

    return Response.json(rows);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[notifications GET]', err);
    return Response.json({ error: 'Failed to load notifications' }, { status: 500 });
  }
}
