import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { promptTemplates } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// Fixed order for the 5 system prompt templates
const BASE_TEMPLATE_IDS = [
  'find-sources',
  'generate-script',
  'validate-script',
  'repair-script',
  'analyze-subscription',
] as const;

// GET /api/settings/prompt-templates — list all templates for current user
// Returns user's custom copy when it exists, otherwise falls back to the base template.
// Order is always fixed per BASE_TEMPLATE_IDS.
export async function GET() {
  try {
    const session = await requireAuth();
    const db = getDb();

    // Load base (system) templates
    const baseRows = db
      .select()
      .from(promptTemplates)
      .where(inArray(promptTemplates.id, [...BASE_TEMPLATE_IDS]))
      .all();
    const baseMap = new Map(baseRows.map((t) => [t.id, t]));

    // Load user's custom overrides
    const userRows = db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.userId, session.userId))
      .all();
    // User template IDs are `${userId}-${baseId}` — extract the baseId portion
    const userMap = new Map(
      userRows.map((t) => [t.id.slice(session.userId.length + 1), t])
    );

    // Merge in fixed order; always expose base ID so the frontend uses stable URLs.
    // isCustomized tells the frontend whether the user has a personal override.
    const result = BASE_TEMPLATE_IDS.flatMap((baseId) => {
      const custom = userMap.get(baseId);
      const base = baseMap.get(baseId);
      const tpl = custom ?? base;
      if (!tpl) return [];
      return [{ ...tpl, id: baseId, isCustomized: !!custom }];
    });

    return Response.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[prompt-templates GET]', err);
    return Response.json({ error: 'Failed to load templates' }, { status: 500 });
  }
}
