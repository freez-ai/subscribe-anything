import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { notifications } from '@/lib/db/schema';

// POST /api/notifications/[id]/read — mark a notification as read
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const n = db.select({ id: notifications.id }).from(notifications).where(eq(notifications.id, id)).get();
    if (!n) return Response.json({ error: 'Not found' }, { status: 404 });

    db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id)).run();
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[notifications/[id]/read POST]', err);
    return Response.json({ error: 'Failed to mark notification as read' }, { status: 500 });
  }
}
