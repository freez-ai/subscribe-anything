import { getDb } from '@/lib/db';
import { oauthConfig } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';

// GET /api/settings/oauth/google — get Google OAuth config (admin only, secret masked)
export async function GET() {
  try {
    await requireAdmin();
    const db = getDb();
    const row = db.select().from(oauthConfig).where(eq(oauthConfig.id, 'google')).get();

    if (!row) {
      return Response.json({ configured: false, clientId: '', enabled: false });
    }

    return Response.json({
      configured: !!row.clientId,
      clientId: row.clientId,
      // Never expose clientSecret
      enabled: row.enabled,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[oauth-config GET]', err);
    return Response.json({ error: 'Failed to load OAuth config' }, { status: 500 });
  }
}

// PUT /api/settings/oauth/google — save Google OAuth config (admin only)
export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { clientId, clientSecret, enabled } = body;

    const db = getDb();
    const existing = db
      .select({ clientSecret: oauthConfig.clientSecret })
      .from(oauthConfig)
      .where(eq(oauthConfig.id, 'google'))
      .get();

    // Keep existing secret if new one is empty
    const finalSecret = clientSecret || (existing?.clientSecret ?? '');

    const now = new Date();
    db.insert(oauthConfig)
      .values({
        id: 'google',
        clientId: clientId ?? '',
        clientSecret: finalSecret,
        enabled: enabled !== false,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: oauthConfig.id,
        set: {
          clientId: clientId ?? '',
          clientSecret: finalSecret,
          enabled: enabled !== false,
          updatedAt: now,
        },
      })
      .run();

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[oauth-config PUT]', err);
    return Response.json({ error: 'Failed to save OAuth config' }, { status: 500 });
  }
}
