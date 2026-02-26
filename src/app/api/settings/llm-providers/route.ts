import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { llmProviders } from '@/lib/db/schema';
import { createId } from '@paralleldrive/cuid2';

// GET /api/settings/llm-providers — list all providers
export async function GET() {
  try {
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
    console.error('[llm-providers GET]', err);
    return Response.json({ error: 'Failed to load providers' }, { status: 500 });
  }
}

// POST /api/settings/llm-providers — create new provider
export async function POST(req: Request) {
  try {
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

    db.insert(llmProviders)
      .values({
        id,
        name,
        baseUrl,
        apiKey,
        modelId,
        headers: headers ? JSON.stringify(headers) : null,
        isActive: false,
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
    console.error('[llm-providers POST]', err);
    return Response.json({ error: 'Failed to create provider' }, { status: 500 });
  }
}
