import { eq, ne } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { rssInstances } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth';

// Helper to handle auth errors
function handleAuthError(err: unknown): Response | null {
  if (err instanceof Error) {
    if (err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (err.message === 'FORBIDDEN') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
  }
  return null;
}

// POST /api/settings/rss-instances/[id]/activate (admin only)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = getDb();

    const existing = db.select().from(rssInstances).where(eq(rssInstances.id, id)).get();
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    const now = new Date();
    db.update(rssInstances).set({ isActive: false, updatedAt: now }).where(ne(rssInstances.id, id)).run();
    db.update(rssInstances).set({ isActive: true, updatedAt: now }).where(eq(rssInstances.id, id)).run();

    return Response.json({ success: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[rss-instances/[id]/activate POST]', err);
    return Response.json({ error: 'Failed to activate RSS instance' }, { status: 500 });
  }
}
