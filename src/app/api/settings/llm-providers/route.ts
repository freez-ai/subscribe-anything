import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { llmProviders } from '@/lib/db/schema';
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

// GET /api/settings/llm-providers — list all providers (admin only)
export async function GET() {
  try {
    await requireAdmin();
    const db = getDb();
    const rows = db
      .select({
        id: llmProviders.id,
        name: llmProviders.name,
        baseUrl: llmProviders.baseUrl,
        modelId: llmProviders.modelId,
        isActive: llmProviders.isActive,
        totalTokensUsed: llmProviders.totalTokensUsed,
        createdAt: llmProviders.createdAt,
        updatedAt: llmProviders.updatedAt,
        // apiKey intentionally omitted from list endpoint
      })
      .from(llmProviders)
      .orderBy(llmProviders.createdAt)
      .all();

    return Response.json(rows);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[llm-providers GET]', err);
    return Response.json({ error: 'Failed to load providers' }, { status: 500 });
  }
}

// POST /api/settings/llm-providers — create new provider (admin only)
export async function POST(req: Request) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const { name, baseUrl, apiKey, modelId, headers } = body;

    if (!name || !baseUrl || !apiKey || !modelId) {
      return Response.json(
        { error: 'name, baseUrl, apiKey, modelId are required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const now = new Date();
    const id = createId();

    // Auto-activate if this is the first provider
    const existingCount = db.select({ id: llmProviders.id }).from(llmProviders).all().length;
    const isFirst = existingCount === 0;

    db.insert(llmProviders)
      .values({
        id,
        name,
        baseUrl,
        apiKey,
        modelId,
        headers: headers ? JSON.stringify(headers) : null,
        isActive: isFirst,
        createdBy: session.userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const created = db
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.id, id))
      .get();

    return Response.json({ ...created, apiKey: '' }, { status: 201 });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[llm-providers POST]', err);
    return Response.json({ error: 'Failed to create provider' }, { status: 500 });
  }
}
