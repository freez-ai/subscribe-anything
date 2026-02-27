import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { rssInstances } from '@/lib/db/schema';
import { createId } from '@paralleldrive/cuid2';
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

// GET /api/settings/rss-instances (admin only)
export async function GET() {
  try {
    await requireAdmin();
    const db = getDb();
    const rows = db.select().from(rssInstances).orderBy(rssInstances.createdAt).all();
    return Response.json(rows);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[rss-instances GET]', err);
    return Response.json({ error: 'Failed to load RSS instances' }, { status: 500 });
  }
}

// POST /api/settings/rss-instances (admin only)
export async function POST(req: Request) {
  try {
    const session = await requireAdmin();
    const { name, baseUrl } = await req.json();
    if (!name || !baseUrl) {
      return Response.json({ error: 'name and baseUrl are required' }, { status: 400 });
    }

    const db = getDb();
    const now = new Date();
    const id = createId();

    db.insert(rssInstances)
      .values({
        id,
        name,
        baseUrl,
        isActive: false,
        createdBy: session.userId,
        createdAt: now,
        updatedAt: now
      })
      .run();

    const created = db.select().from(rssInstances).where(eq(rssInstances.id, id)).get();
    return Response.json(created, { status: 201 });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[rss-instances POST]', err);
    return Response.json({ error: 'Failed to create RSS instance' }, { status: 500 });
  }
}
