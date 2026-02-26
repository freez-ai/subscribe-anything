import { getDb } from '@/lib/db';
import { promptTemplates } from '@/lib/db/schema';

// GET /api/settings/prompt-templates — list all templates
export async function GET() {
  try {
    const db = getDb();
    const rows = db
      .select()
      .from(promptTemplates)
      .orderBy(promptTemplates.id)
      .all();
    return Response.json(rows);
  } catch (err) {
    console.error('[prompt-templates GET]', err);
    return Response.json({ error: 'Failed to load templates' }, { status: 500 });
  }
}
