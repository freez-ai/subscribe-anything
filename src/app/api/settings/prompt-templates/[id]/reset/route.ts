import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { promptTemplates } from '@/lib/db/schema';

// POST /api/settings/prompt-templates/[id]/reset — restore content to defaultContent
export async function POST(
  _req: Request,
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
    console.error('[prompt-templates/[id]/reset POST]', err);
    return Response.json({ error: 'Failed to reset template' }, { status: 500 });
  }
}
