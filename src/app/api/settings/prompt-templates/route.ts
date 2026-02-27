import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { promptTemplates } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// GET /api/settings/prompt-templates — list all templates for current user
export async function GET() {
  try {
    const session = await requireAuth();
    const db = getDb();
    const rows = db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.userId, session.userId))
      .orderBy(promptTemplates.id)
      .all();
    return Response.json(rows);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[prompt-templates GET]', err);
    return Response.json({ error: 'Failed to load templates' }, { status: 500 });
  }
}
