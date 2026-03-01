import { getDb } from '@/lib/db';
import { users, passwordResetTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { isSmtpConfigured } from '@/lib/email/smtp';
import crypto from 'crypto';

const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const COOLDOWN_MS = 60 * 1000; // 60 seconds between requests

// Generate a secure random token
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// POST /api/auth/reset-password/send - send password reset email
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return Response.json({ error: '请输入邮箱地址' }, { status: 400 });
    }

    // Check if email provider is configured
    if (!isSmtpConfigured()) {
      return Response.json({ error: '邮件服务未配置' }, { status: 400 });
    }

    const db = getDb();
    const now = new Date();

    // Find user by email
    const user = db.select().from(users).where(eq(users.email, email)).get();

    // Always return success to prevent email enumeration
    if (!user) {
      console.log('[Reset Password] User not found:', email);
      return Response.json({ success: true });
    }

    // Check if user has a password (not OAuth-only user)
    if (!user.passwordHash) {
      console.log('[Reset Password] User has no password:', email);
      return Response.json({ success: true });
    }

    // Check cooldown
    const recentToken = db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id))
      .orderBy(passwordResetTokens.createdAt)
      .all()
      .filter(t => !t.usedAt && t.createdAt.getTime() > now.getTime() - COOLDOWN_MS)
      .at(0);

    if (recentToken) {
      const remainingSeconds = Math.ceil(
        (recentToken.createdAt.getTime() + COOLDOWN_MS - now.getTime()) / 1000
      );
      return Response.json({ error: `请等待 ${remainingSeconds} 秒后再试` }, { status: 429 });
    }

    // Invalidate existing unused tokens for this user
    db.delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id))
      .run();

    // Create new token
    const token = generateToken();
    const id = createId();
    const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_MS);

    db.insert(passwordResetTokens)
      .values({
        id,
        userId: user.id,
        token,
        expiresAt,
        createdAt: now,
      })
      .run();

    // Send email
    const { sendEmail } = await import('@/lib/email/smtp');
    const resetLink = `${process.env.NEXT_PUBLIC_BASE_URL || ''}/reset-password?token=${token}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 480px; margin: 0 auto; padding: 40px 20px; }
          .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
          .footer { font-size: 12px; color: #666; text-align: center; margin-top: 32px; }
          .warning { font-size: 14px; color: #666; background: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 24px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>重置密码</h2>
          <p>您好！</p>
          <p>我们收到了您的密码重置请求。请点击下方按钮重置密码：</p>
          <p><a href="${resetLink}" class="button">重置密码</a></p>
          <p>如果按钮无法点击，请复制以下链接到浏览器：</p>
          <p style="word-break: break-all; color: #666;">${resetLink}</p>
          <p>重置链接有效期为 <strong>15 分钟</strong>。</p>
          <div class="warning">
            如果您没有请求重置密码，请忽略此邮件。
          </div>
          <div class="footer">
            <p>此邮件由系统自动发送，请勿回复。</p>
            <p>&copy; ${new Date().getFullYear()} Subscribe Anything</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
重置密码

您好！

我们收到了您的密码重置请求。请访问以下链接重置密码：

${resetLink}

重置链接有效期为 15 分钟。

如果您没有请求重置密码，请忽略此邮件。

此邮件由系统自动发送，请勿回复。
© ${new Date().getFullYear()} Subscribe Anything
    `.trim();

    await sendEmail({
      to: email,
      subject: 'Subscribe Anything - 重置密码',
      html,
      text,
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error('[Reset Password] Send error:', err);
    return Response.json({ error: '发送重置邮件失败' }, { status: 500 });
  }
}
