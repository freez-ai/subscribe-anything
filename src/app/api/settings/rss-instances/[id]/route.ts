import { eq } from 'drizzle-orm';
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

// PATCH /api/settings/rss-instances/[id] (admin only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = getDb();

    const existing = db.select().from(rssInstances).where(eq(rssInstances.id, id)).get();
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    const { name, baseUrl } = await req.json();
    const updates: Partial<typeof rssInstances.$inferInsert> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (baseUrl !== undefined) updates.baseUrl = baseUrl;

    db.update(rssInstances).set(updates).where(eq(rssInstances.id, id)).run();

    const updated = db.select().from(rssInstances).where(eq(rssInstances.id, id)).get();
    return Response.json(updated);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[rss-instances/[id] PATCH]', err);
    return Response.json({ error: 'Failed to update RSS instance' }, { status: 500 });
  }
}

// DELETE /api/settings/rss-instances/[id] (admin only)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = getDb();

    const existing = db.select().from(rssInstances).where(eq(rssInstances.id, id)).get();
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    db.delete(rssInstances).where(eq(rssInstances.id, id)).run();
    return new Response(null, { status: 204 });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[rss-instances/[id] DELETE]', err);
    return Response.json({ error: 'Failed to delete RSS instance' }, { status: 500 });
  }
}
