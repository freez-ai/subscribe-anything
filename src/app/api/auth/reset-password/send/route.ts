import { getDb } from '@/lib/db';
import { users, passwordResetTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { isSmtpConfigured } from '@/lib/email/smtp';
import { verifyTurnstileToken, isTurnstileConfigured } from '@/lib/turnstile';
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
    const { email, turnstileToken } = body;

    if (!email) {
      return Response.json({ error: '请输入邮箱地址' }, { status: 400 });
    }

    // 如果配置了 Turnstile，则进行验证
    if (isTurnstileConfigured()) {
      const turnstileResult = await verifyTurnstileToken(turnstileToken);
      if (!turnstileResult.success) {
        return Response.json(
          { error: turnstileResult.error || '人机验证失败，请重试' },
          { status: 403 }
        );
      }
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
    const resetToken = generateToken();
    const id = createId();
    const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_MS);

    db.insert(passwordResetTokens)
      .values({
        id,
        userId: user.id,
        token: resetToken,
        expiresAt,
        createdAt: now,
      })
      .run();

    // Send email
    const { sendEmail } = await import('@/lib/email/smtp');

    // Get the base URL from request headers for generating proper reset link
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 500px; margin: 0 auto; padding: 40px 20px; }
          .button { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 14px 28px; text-decoration: none !important; border-radius: 8px; font-weight: 500; font-size: 16px; }
          .button:hover { background-color: #1d4ed8; }
          .footer { font-size: 12px; color: #9ca3af; text-align: center; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
          .warning { font-size: 14px; color: #92400e; background-color: #fef3c7; padding: 12px 16px; border-radius: 6px; margin-top: 24px; border: 1px solid #fcd34d; }
          .link-text { color: #2563eb; word-break: break-all; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2 style="margin-top: 0;">重置密码</h2>
          <p>您好！</p>
          <p>我们收到了您的密码重置请求。请点击下方按钮重置密码：</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
            <tr>
              <td style="border-radius: 8px;" bgcolor="#2563eb">
                <a href="${resetLink}" class="button" style="display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 14px 28px; text-decoration: none !important; border-radius: 8px; font-weight: 500; font-size: 16px; border: none;">重置密码</a>
              </td>
            </tr>
          </table>
          <p style="margin: 24px 0 8px 0;">如果按钮无法点击，请复制以下链接到浏览器：</p>
          <p class="link-text">${resetLink}</p>
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

如果链接无法点击，请复制完整链接到浏览器打开。

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
