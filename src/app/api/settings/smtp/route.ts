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
        provider: 'smtp',
        host: '',
        port: 465,
        secure: true,
        user: '',
        password: '',
        zeaburApiKey: '',
        resendApiKey: '',
        fromEmail: '',
        fromName: 'Subscribe Anything',
        requireVerification: true,
      });
    }

    return Response.json({
      configured: true,
      provider: row.provider ?? 'smtp',
      host: row.host,
      port: row.port,
      secure: row.secure,
      user: row.user,
      password: '', // never expose password
      zeaburApiKey: row.zeaburApiKey ? '••••••••' : '', // mask key
      resendApiKey: row.resendApiKey ? '••••••••' : '', // mask key
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
    const { provider = 'smtp', host, port, secure, user, password, zeaburApiKey, resendApiKey, fromEmail, fromName, requireVerification } = body;

    if (provider === 'zeabur') {
      if (!fromEmail) {
        return Response.json({ error: 'fromEmail is required for Zeabur Email' }, { status: 400 });
      }
    } else if (provider === 'resend') {
      if (!fromEmail) {
        return Response.json({ error: 'fromEmail is required for Resend' }, { status: 400 });
      }
    } else {
      if (!host || !user) {
        return Response.json({ error: 'host and user are required' }, { status: 400 });
      }
    }

    const db = getDb();

    // Auto-migrate: add resend_api_key column if it doesn't exist
    try {
      const tableInfo = db.prepare('PRAGMA table_info(smtp_config)').all() as Array<{ name: string }>;
      const hasResendColumn = tableInfo.some(col => col.name === 'resend_api_key');
      if (!hasResendColumn) {
        db.exec('ALTER TABLE smtp_config ADD COLUMN resend_api_key TEXT');
        console.log('[smtp PUT] Added resend_api_key column');
      }
    } catch (e) {
      console.error('[smtp PUT] Migration check failed:', e);
      // Continue anyway, error will be caught below if column is missing
    }

    const existing = db.select({ password: smtpConfig.password, zeaburApiKey: smtpConfig.zeaburApiKey, resendApiKey: smtpConfig.resendApiKey }).from(smtpConfig).where(eq(smtpConfig.id, 'default')).get();

    // Keep existing secrets if new ones are empty
    const finalPassword = password || (existing?.password ?? '');
    const finalZeaburApiKey = zeaburApiKey && zeaburApiKey !== '••••••••' ? zeaburApiKey : (existing?.zeaburApiKey ?? null);
    const finalResendApiKey = resendApiKey && resendApiKey !== '••••••••' ? resendApiKey : (existing?.resendApiKey ?? null);

    const now = new Date();
    db.insert(smtpConfig)
      .values({
        id: 'default',
        provider,
        host: host || '',
        port: Number(port) || 465,
        secure: !!secure,
        user: user || '',
        password: finalPassword,
        zeaburApiKey: finalZeaburApiKey,
        resendApiKey: finalResendApiKey,
        fromEmail: fromEmail || null,
        fromName: fromName || 'Subscribe Anything',
        requireVerification: requireVerification !== false,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: smtpConfig.id,
        set: {
          provider,
          host: host || '',
          port: Number(port) || 465,
          secure: !!secure,
          user: user || '',
          password: finalPassword,
          zeaburApiKey: finalZeaburApiKey,
          resendApiKey: finalResendApiKey,
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
    const errorMsg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: 'Failed to save SMTP config', details: errorMsg }, { status: 500 });
  }
}
