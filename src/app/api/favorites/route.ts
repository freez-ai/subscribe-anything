import { desc, eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { favorites } from '@/lib/db/schema';

// GET /api/favorites — list all favorites ordered by favoriteAt DESC
// Only returns items where isFavorite = true
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50')));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0'));

    const db = getDb();

    // Only count favorites that are active (isFavorite = true)
    const total = db
      .select()
      .from(favorites)
      .where(eq(favorites.isFavorite, true))
      .all().length;

    const rows = db
      .select()
      .from(favorites)
      .where(eq(favorites.isFavorite, true))
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
    console.error('[favorites GET]', err);
    return Response.json({ error: 'Failed to fetch favorites' }, { status: 500 });
  }
}
