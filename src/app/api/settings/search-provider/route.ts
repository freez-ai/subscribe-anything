import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { searchProviderConfig } from '@/lib/db/schema';

// GET /api/settings/search-provider — get current search config (apiKey masked)
export async function GET() {
  try {
    const db = getDb();
    const row = db
      .select()
      .from(searchProviderConfig)
      .where(eq(searchProviderConfig.id, 'default'))
      .get();

    if (!row) {
      return Response.json({ id: 'default', provider: 'none', apiKey: '' });
    }
    return Response.json({ ...row, apiKey: '' });
  } catch (err) {
    console.error('[search-provider GET]', err);
    return Response.json({ error: 'Failed to load search config' }, { status: 500 });
  }
}

// PUT /api/settings/search-provider — upsert search config
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { provider, apiKey } = body;

    if (!['tavily', 'serper', 'none'].includes(provider)) {
      return Response.json(
        { error: "provider must be one of: tavily, serper, none" },
        { status: 400 }
      );
    }

    const db = getDb();
    const now = new Date();

    const existing = db
      .select()
      .from(searchProviderConfig)
      .where(eq(searchProviderConfig.id, 'default'))
      .get();

    // Only overwrite apiKey when the caller provides a non-empty value
    const resolvedApiKey = apiKey ? apiKey : (existing?.apiKey ?? '');

    db.insert(searchProviderConfig)
      .values({ id: 'default', provider, apiKey: resolvedApiKey, updatedAt: now })
      .onConflictDoUpdate({
        target: searchProviderConfig.id,
        set: { provider, apiKey: resolvedApiKey, updatedAt: now },
      })
      .run();

    return Response.json({ id: 'default', provider, apiKey: '' });
  } catch (err) {
    console.error('[search-provider PUT]', err);
    return Response.json({ error: 'Failed to update search config' }, { status: 500 });
  }
}
