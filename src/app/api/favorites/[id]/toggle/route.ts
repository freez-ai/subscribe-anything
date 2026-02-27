import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { favorites } from '@/lib/db/schema';

// POST /api/favorites/[id]/toggle — toggle favorite status by favorite ID
// This endpoint is used by the favorites page where the original card may no longer exist
// Uses soft-delete: sets isFavorite flag instead of deleting the row
// Returns { ok: true, isFavorite: boolean }
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    // Find the favorite by its own ID
    const existingFavorite = db
      .select()
      .from(favorites)
      .where(eq(favorites.id, id))
      .get();

    if (existingFavorite) {
      // Toggle the isFavorite flag
      const newIsFavorite = !existingFavorite.isFavorite;
      db.update(favorites)
        .set({ isFavorite: newIsFavorite })
        .where(eq(favorites.id, id))
        .run();
      return Response.json({ ok: true, isFavorite: newIsFavorite });
    }

    // Not currently in favorites table
    return Response.json({ error: 'Favorite not found' }, { status: 404 });
  } catch (err) {
    console.error('[favorites/[id]/toggle POST]', err);
    return Response.json({ error: 'Failed to toggle favorite' }, { status: 500 });
  }
}
