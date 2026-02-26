import { eq, desc, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { notifications } from '@/lib/db/schema';

// GET /api/notifications?subscriptionId=&isRead=false
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const subscriptionId = url.searchParams.get('subscriptionId');
    const isReadParam = url.searchParams.get('isRead');

    const db = getDb();
    const conditions = [];

    if (subscriptionId) conditions.push(eq(notifications.subscriptionId, subscriptionId));
    if (isReadParam === 'false') conditions.push(eq(notifications.isRead, false));

    const rows = db
      .select()
      .from(notifications)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(notifications.createdAt))
      .limit(50)
      .all();

    return Response.json(rows);
  } catch (err) {
    console.error('[notifications GET]', err);
    return Response.json({ error: 'Failed to load notifications' }, { status: 500 });
  }
}
