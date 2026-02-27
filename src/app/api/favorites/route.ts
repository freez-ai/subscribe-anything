import { desc, eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { favorites } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// GET /api/favorites — list all favorites ordered by favoriteAt DESC
// Only returns items where isFavorite = true
export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50')));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0'));

    const db = getDb();

    // Only count favorites that are active (isFavorite = true) and belong to user
    const total = db
      .select()
      .from(favorites)
      .where(and(eq(favorites.isFavorite, true), eq(favorites.userId, session.userId)))
      .all().length;

    const rows = db
      .select()
      .from(favorites)
      .where(and(eq(favorites.isFavorite, true), eq(favorites.userId, session.userId)))
      .orderBy(desc(favorites.favoriteAt))
      .limit(limit)
      .offset(offset)
      .all();

    return Response.json({
      data: rows,
      total,
      offset,
      limit,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[favorites GET]', err);
    return Response.json({ error: 'Failed to fetch favorites' }, { status: 500 });
  }
}
