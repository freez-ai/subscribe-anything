import { getDb } from '@/lib/db';
import { smtpConfig } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { sendEmail } from '@/lib/email/smtp';

// POST /api/settings/smtp/test — test SMTP connection (admin only)
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { testEmail } = body;

    if (!testEmail) {
      return Response.json({ error: 'testEmail is required' }, { status: 400 });
    }

    // Check that SMTP is configured
    const db = getDb();
    const config = db.select().from(smtpConfig).where(eq(smtpConfig.id, 'default')).get();

    if (!config || !config.host || !config.user || !config.password) {
      return Response.json({ error: '请先保存 SMTP 配置' }, { status: 400 });
    }

    const result = await sendEmail({
      to: testEmail,
      subject: 'Subscribe Anything - SMTP 配置测试',
      html: `<p>这是一封测试邮件，说明您的 SMTP 配置正常工作。</p>`,
      text: '这是一封测试邮件，说明您的 SMTP 配置正常工作。',
    });

    if (!result.success) {
      return Response.json({ error: result.error || '发送失败' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[smtp/test POST]', err);
    return Response.json({ error: 'Failed to send test email' }, { status: 500 });
  }
}
