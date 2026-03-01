import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
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
  provider: string; // 'smtp' | 'zeabur' | 'resend'
  zeaburApiKey?: string | null;
  resendApiKey?: string | null;
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
    provider: config.provider ?? 'smtp',
    zeaburApiKey: config.zeaburApiKey,
    resendApiKey: config.resendApiKey,
  };
}

/**
 * Check if SMTP is configured
 */
export function isSmtpConfigured(): boolean {
  const config = getSmtpConfig();
  if (!config) return false;
  if (config.provider === 'zeabur') {
    return !!(config.zeaburApiKey && config.fromEmail);
  }
  if (config.provider === 'resend') {
    return !!(config.resendApiKey && config.fromEmail);
  }
  return !!(config.host && config.user && config.password);
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
  const options: SMTPTransport.Options & { family?: number } = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    family: 4,
  };
  return nodemailer.createTransport(options);
}

/**
 * Send email via Zeabur Email API
 */
async function sendEmailViaZeabur(
  config: SmtpConfigData,
  { to, subject, html, text }: SendEmailOptions
): Promise<{ success: boolean; error?: string }> {
  const fromEmail = config.fromEmail || config.user;
  const fromName = config.fromName || 'Subscribe Anything';

  const res = await fetch('https://api.zeabur.com/api/v1/zsend/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.zeaburApiKey}`,
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.message || body?.error || res.statusText;
    return { success: false, error: `Zeabur Email error ${res.status}: ${msg}` };
  }

  return { success: true };
}

/**
 * Send email via Resend API
 */
async function sendEmailViaResend(
  config: SmtpConfigData,
  { to, subject, html, text }: SendEmailOptions
): Promise<{ success: boolean; error?: string }> {
  const { Resend } = await import('resend');
  const resend = new Resend(config.resendApiKey!);

  const fromEmail = config.fromEmail || 'onboarding@resend.dev';
  const fromName = config.fromName || 'Subscribe Anything';

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html: html || undefined,
      text: text || undefined,
    } as any);
    return { success: true };
  } catch (error) {
    console.error('[Resend] Send error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Send email using configured provider (SMTP, Zeabur Email, or Resend)
 */
export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const config = getSmtpConfig();

  if (!config) {
    return { success: false, error: 'SMTP not configured' };
  }

  if (config.provider === 'zeabur') {
    return sendEmailViaZeabur(config, { to, subject, html, text });
  }

  if (config.provider === 'resend') {
    return sendEmailViaResend(config, { to, subject, html, text });
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
