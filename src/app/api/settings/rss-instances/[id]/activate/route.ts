import { eq, ne } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { rssInstances } from '@/lib/db/schema';

// POST /api/settings/rss-instances/[id]/activate
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.select().from(rssInstances).where(eq(rssInstances.id, id)).get();
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    const now = new Date();
    db.update(rssInstances).set({ isActive: false, updatedAt: now }).where(ne(rssInstances.id, id)).run();
    db.update(rssInstances).set({ isActive: true, updatedAt: now }).where(eq(rssInstances.id, id)).run();

    return Response.json({ success: true });
  } catch (err) {
    console.error('[rss-instances/[id]/activate POST]', err);
    return Response.json({ error: 'Failed to activate RSS instance' }, { status: 500 });
  }
}
