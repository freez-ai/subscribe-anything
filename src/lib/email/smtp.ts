import nodemailer from 'nodemailer';
import { getDb } from '@/lib/db';
import { smtpConfig } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface SmtpConfigData {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail?: string | null;
  fromName?: string | null;
  requireVerification: boolean;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Get SMTP configuration from database
 */
export function getSmtpConfig(): SmtpConfigData | null {
  const db = getDb();
  const config = db.select().from(smtpConfig).where(eq(smtpConfig.id, 'default')).get();

  if (!config) {
    return null;
  }

  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    password: config.password,
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    requireVerification: config.requireVerification ?? true,
  };
}

/**
 * Check if SMTP is configured
 */
export function isSmtpConfigured(): boolean {
  const config = getSmtpConfig();
  return !!(config && config.host && config.user && config.password);
}

/**
 * Check if email verification is required for registration
 */
export function isVerificationRequired(): boolean {
  const config = getSmtpConfig();
  if (!config) return false;
  return config.requireVerification ?? true;
}

/**
 * Create nodemailer transporter from config
 */
function createTransporter(config: SmtpConfigData) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    family: 4,
  });
}

/**
 * Send email using configured SMTP
 */
export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const config = getSmtpConfig();

  if (!config) {
    return { success: false, error: 'SMTP not configured' };
  }

  const transporter = createTransporter(config);

  const fromEmail = config.fromEmail || config.user;
  const fromName = config.fromName || 'Subscribe Anything';

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      text,
    });

    return { success: true };
  } catch (error) {
    console.error('[Email] Send error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Send verification code email
 */
export async function sendVerificationCode(email: string, code: string): Promise<{ success: boolean; error?: string }> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 480px; margin: 0 auto; padding: 40px 20px; }
        .code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb; text-align: center; padding: 20px; background: #f3f4f6; border-radius: 8px; margin: 24px 0; }
        .footer { font-size: 12px; color: #666; text-align: center; margin-top: 32px; }
        .warning { font-size: 14px; color: #666; background: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>验证您的邮箱</h2>
        <p>您好！</p>
        <p>您正在注册 Subscribe Anything 账户，请使用以下验证码完成验证：</p>
        <div class="code">${code}</div>
        <p>验证码有效期为 <strong>5 分钟</strong>，请尽快完成验证。</p>
        <div class="warning">
          如果您没有请求此验证码，请忽略此邮件。
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
验证您的邮箱

您好！

您正在注册 Subscribe Anything 账户，请使用以下验证码完成验证：

验证码：${code}

验证码有效期为 5 分钟，请尽快完成验证。

如果您没有请求此验证码，请忽略此邮件。

此邮件由系统自动发送，请勿回复。
© ${new Date().getFullYear()} Subscribe Anything
  `.trim();

  return sendEmail({
    to: email,
    subject: 'Subscribe Anything - 邮箱验证码',
    html,
    text,
  });
}
