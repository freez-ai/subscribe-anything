import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { createVerificationCode } from '@/lib/auth/verification';
import { sendVerificationCode, isSmtpConfigured } from '@/lib/email/smtp';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: '请输入邮箱地址' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
    }

    // Check if SMTP is configured
    if (!isSmtpConfigured()) {
      return NextResponse.json({ error: '邮件服务未配置，请联系管理员' }, { status: 500 });
    }

    const db = getDb();

    // Check if email already registered
    const existingUser = db.select().from(users).where(eq(users.email, email)).get();
    if (existingUser) {
      return NextResponse.json({ error: '该邮箱已被注册' }, { status: 400 });
    }

    // Create verification code
    const result = await createVerificationCode(email, 'register');

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 429 });
    }

    // Send email
    const sendResult = await sendVerificationCode(email, result.code);

    if (!sendResult.success) {
      console.error('[Auth] Send verification email error:', sendResult.error);
      return NextResponse.json({ error: '发送验证码失败，请稍后重试' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '验证码已发送到您的邮箱' });
  } catch (error) {
    console.error('[Auth] Send verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
