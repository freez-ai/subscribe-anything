import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { llmProviders } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth';

function maskApiKey<T extends { apiKey?: string | null }>(row: T): T {
  return { ...row, apiKey: '' };
}

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

// GET /api/settings/llm-providers/[id] — get single provider (apiKey masked)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = getDb();
    const row = db
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.id, id))
      .get();

    if (!row) {
      return Response.json({ error: 'Provider not found' }, { status: 404 });
    }
    return Response.json(maskApiKey(row));
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[llm-providers/[id] GET]', err);
    return Response.json({ error: 'Failed to load provider' }, { status: 500 });
  }
}

// PATCH /api/settings/llm-providers/[id] — update provider
export async function PATCH(
  req: Request,
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

    const body = await req.json();
    const { name, baseUrl, apiKey, modelId, headers } = body;

    const updates: Partial<typeof llmProviders.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updates.name = name;
    if (baseUrl !== undefined) updates.baseUrl = baseUrl;
    // Only overwrite apiKey when the caller provides a non-empty value
    if (apiKey) updates.apiKey = apiKey;
    if (modelId !== undefined) updates.modelId = modelId;
    if (headers !== undefined) {
      updates.headers = headers ? JSON.stringify(headers) : null;
    }

    db.update(llmProviders).set(updates).where(eq(llmProviders.id, id)).run();

    const updated = db
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.id, id))
      .get();

    return Response.json(maskApiKey(updated!));
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[llm-providers/[id] PATCH]', err);
    return Response.json({ error: 'Failed to update provider' }, { status: 500 });
  }
}

// DELETE /api/settings/llm-providers/[id] — delete provider
export async function DELETE(
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

    db.delete(llmProviders).where(eq(llmProviders.id, id)).run();
    return new Response(null, { status: 204 });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[llm-providers/[id] DELETE]', err);
    return Response.json({ error: 'Failed to delete provider' }, { status: 500 });
  }
}
