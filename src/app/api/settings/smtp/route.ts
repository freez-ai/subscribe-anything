import { getDb } from '@/lib/db';
import { smtpConfig } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';

// GET /api/settings/smtp — get SMTP config (admin only, password masked)
export async function GET() {
  try {
    await requireAdmin();
    const db = getDb();
    const row = db.select().from(smtpConfig).where(eq(smtpConfig.id, 'default')).get();

    if (!row) {
      return Response.json({
        configured: false,
        host: '',
        port: 465,
        secure: true,
        user: '',
        password: '',
        fromEmail: '',
        fromName: 'Subscribe Anything',
        requireVerification: true,
      });
    }

    return Response.json({
      configured: true,
      host: row.host,
      port: row.port,
      secure: row.secure,
      user: row.user,
      password: '', // never expose password
      fromEmail: row.fromEmail ?? '',
      fromName: row.fromName ?? 'Subscribe Anything',
      requireVerification: row.requireVerification ?? true,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[smtp GET]', err);
    return Response.json({ error: 'Failed to load SMTP config' }, { status: 500 });
  }
}

// PUT /api/settings/smtp — save SMTP config (admin only)
export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { host, port, secure, user, password, fromEmail, fromName, requireVerification } = body;

    if (!host || !user) {
      return Response.json({ error: 'host and user are required' }, { status: 400 });
    }

    const db = getDb();
    const existing = db.select({ password: smtpConfig.password }).from(smtpConfig).where(eq(smtpConfig.id, 'default')).get();

    // Keep existing password if new one is empty
    const finalPassword = password || (existing?.password ?? '');

    const now = new Date();
    db.insert(smtpConfig)
      .values({
        id: 'default',
        host,
        port: Number(port) || 465,
        secure: !!secure,
        user,
        password: finalPassword,
        fromEmail: fromEmail || null,
        fromName: fromName || 'Subscribe Anything',
        requireVerification: requireVerification !== false,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: smtpConfig.id,
        set: {
          host,
          port: Number(port) || 465,
          secure: !!secure,
          user,
          password: finalPassword,
          fromEmail: fromEmail || null,
          fromName: fromName || 'Subscribe Anything',
          requireVerification: requireVerification !== false,
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
    console.error('[smtp PUT]', err);
    return Response.json({ error: 'Failed to save SMTP config' }, { status: 500 });
  }
}
