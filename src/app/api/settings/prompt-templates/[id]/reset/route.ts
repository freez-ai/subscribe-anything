import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { promptTemplates } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// POST /api/settings/prompt-templates/[id]/reset — restore content to defaultContent
export async function POST(
  _req: Request,
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

    db.update(promptTemplates)
      .set({ content: existing.defaultContent, updatedAt: new Date() })
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
    console.error('[prompt-templates/[id]/reset POST]', err);
    return Response.json({ error: 'Failed to reset template' }, { status: 500 });
  }
}
