import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { promptTemplates } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// PATCH /api/settings/prompt-templates/[id] — update template content
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    // Verify template belongs to user
    const existing = db
      .select()
      .from(promptTemplates)
      .where(and(eq(promptTemplates.id, id), eq(promptTemplates.userId, session.userId)))
      .get();
    if (!existing) {
      return Response.json({ error: 'Template not found' }, { status: 404 });
    }

    const body = await req.json();

    const updates: { content?: string; providerId?: string | null; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (typeof body.content === 'string') updates.content = body.content;
    if ('providerId' in body) updates.providerId = body.providerId ?? null;

    if (!updates.content && !('providerId' in body)) {
      return Response.json({ error: 'content or providerId is required' }, { status: 400 });
    }

    db.update(promptTemplates)
      .set(updates)
      .where(eq(promptTemplates.id, id))
      .run();

    const updated = db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.id, id))
      .get();

    return Response.json(updated);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[prompt-templates/[id] PATCH]', err);
    return Response.json({ error: 'Failed to update template' }, { status: 500 });
  }
}
