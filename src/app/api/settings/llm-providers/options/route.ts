import { getDb } from '@/lib/db';
import { llmProviders } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// GET /api/settings/llm-providers/options — accessible to any authenticated user.
// Returns a minimal provider list (id, modelId, isActive) with no sensitive fields,
// so all users can populate the provider selector in prompt template settings.
export async function GET() {
  try {
    await requireAuth();
    const db = getDb();
    const rows = db
      .select({
        id: llmProviders.id,
        modelId: llmProviders.modelId,
        isActive: llmProviders.isActive,
      })
      .from(llmProviders)
      .orderBy(llmProviders.createdAt)
      .all();
    return Response.json(rows);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[llm-providers/options GET]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
