import { eq, ne } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { llmProviders } from '@/lib/db/schema';
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

// POST /api/settings/llm-providers/[id]/activate — set as the active provider (admin only)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = getDb();

    const existing = db
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.id, id))
      .get();
    if (!existing) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }

    const now = new Date();

    // Deactivate all others first
    db.update(llmProviders)
      .set({ isActive: false, updatedAt: now })
      .where(ne(llmProviders.id, id))
      .run();

    // Activate this one
    db.update(llmProviders)
      .set({ isActive: true, updatedAt: now })
      .where(eq(llmProviders.id, id))
      .run();

    return Response.json({ success: true });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[llm-providers/[id]/activate POST]', err);
    return Response.json({ error: 'Failed to activate provider' }, { status: 500 });
  }
}
