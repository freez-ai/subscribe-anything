import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { promptTemplates } from '@/lib/db/schema';

// PATCH /api/settings/prompt-templates/[id] — update template content
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.id, id))
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
    console.error('[prompt-templates/[id] PATCH]', err);
    return Response.json({ error: 'Failed to update template' }, { status: 500 });
  }
}
