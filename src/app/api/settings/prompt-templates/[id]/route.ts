import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { promptTemplates } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

const BASE_TEMPLATE_IDS = new Set([
  'find-sources',
  'generate-script',
  'validate-script',
  'repair-script',
  'analyze-subscription',
]);

// PATCH /api/settings/prompt-templates/[id] — update template content
// [id] is always a base template ID (e.g. 'find-sources').
// Creates a user-specific copy on first edit; updates it on subsequent edits.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: baseId } = await params;

    if (!BASE_TEMPLATE_IDS.has(baseId)) {
      return Response.json({ error: 'Template not found' }, { status: 404 });
    }

    const db = getDb();

    // We need the base template for defaults (name, description, defaultContent)
    const base = db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.id, baseId))
      .get();
    if (!base) {
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

    const userTemplateId = `${session.userId}-${baseId}`;
    const existing = db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.id, userTemplateId))
      .get();

    if (existing) {
      db.update(promptTemplates)
        .set(updates)
        .where(eq(promptTemplates.id, userTemplateId))
        .run();
    } else {
      // First edit — create user's custom copy seeded from the base template
      db.insert(promptTemplates)
        .values({
          id: userTemplateId,
          name: base.name,
          description: base.description,
          content: updates.content ?? base.content,
          defaultContent: base.defaultContent,
          providerId: 'providerId' in updates ? (updates.providerId ?? null) : base.providerId,
          userId: session.userId,
          updatedAt: new Date(),
        })
        .run();
    }

    const updated = db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.id, userTemplateId))
      .get();

    return Response.json({ ...updated, id: baseId });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[prompt-templates/[id] PATCH]', err);
    return Response.json({ error: 'Failed to update template' }, { status: 500 });
  }
}
