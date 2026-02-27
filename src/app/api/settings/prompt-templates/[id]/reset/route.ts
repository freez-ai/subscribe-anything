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

// POST /api/settings/prompt-templates/[id]/reset — delete user's custom copy
// If the user hasn't customised the template this is a no-op.
// Always returns the (now active) base template with id = baseId.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: baseId } = await params;

    if (!BASE_TEMPLATE_IDS.has(baseId)) {
      return Response.json({ error: 'Template not found' }, { status: 404 });
    }

    const db = getDb();

    // Delete user's custom copy — no-op if it doesn't exist
    db.delete(promptTemplates)
      .where(eq(promptTemplates.id, `${session.userId}-${baseId}`))
      .run();

    // Return the base template so the frontend can refresh its state
    const base = db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.id, baseId))
      .get();
    if (!base) {
      return Response.json({ error: 'Template not found' }, { status: 404 });
    }

    return Response.json({ ...base, id: baseId });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[prompt-templates/[id]/reset POST]', err);
    return Response.json({ error: 'Failed to reset template' }, { status: 500 });
  }
}
