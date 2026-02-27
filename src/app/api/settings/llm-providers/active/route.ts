import { getDb } from '@/lib/db';
import { llmProviders } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// GET /api/settings/llm-providers/active — accessible to any authenticated user.
// Returns { hasActive: boolean } so the wizard can gate entry without needing
// admin access to the full provider list.
export async function GET() {
  try {
    await requireAuth();
    const db = getDb();
    const active = db
      .select({ id: llmProviders.id })
      .from(llmProviders)
      .where(eq(llmProviders.isActive, true))
      .get();
    return Response.json({ hasActive: !!active });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[llm-providers/active GET]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
