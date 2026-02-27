import { NextRequest, NextResponse } from 'next/server';
import { eq, count } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users, promptTemplates } from '@/lib/db/schema';
import { getSession, hashPassword } from '@/lib/auth';
import { verifyCode, invalidateCode } from '@/lib/auth/verification';
import { isSmtpConfigured, isVerificationRequired } from '@/lib/email/smtp';
import { createId } from '@paralleldrive/cuid2';

// Default prompt templates to copy for new users
const DEFAULT_PROMPT_TEMPLATES = [
  {
    id: 'find-sources',
    name: '查找订阅源',
    description: '引导智能体通过网络搜索，为给定主题找到合适的数据源',
  },
  {
    id: 'generate-script',
    name: '生成采集脚本',
    description: '引导智能体为特定数据源编写 JavaScript 采集脚本',
  },
  {
    id: 'validate-script',
    name: '校验采集脚本',
    description: '对采集脚本和采集结果进行 LLM 质量审查',
  },
  {
    id: 'repair-script',
    name: '修复采集脚本',
    description: '引导智能体诊断并修复失效的采集脚本',
  },
  {
    id: 'analyze-subscription',
    name: '分析订阅数据',
    description: '引导智能体对订阅的消息卡片进行综合分析',
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name, verificationCode } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const db = getDb();

    // Check if email already exists
    const existingUser = db.select().from(users).where(eq(users.email, email)).get();
    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }

    // Check if this is the first user (will be admin)
    const userCount = db.select({ count: count() }).from(users).where(eq(users.isGuest, false)).get();
    const isFirstUser = (userCount?.count ?? 0) === 0;

    // First user (admin) skips verification; others require it when SMTP is configured and setting is on
    if (!isFirstUser && isSmtpConfigured() && isVerificationRequired()) {
      if (!verificationCode) {
        return NextResponse.json({ error: '请输入验证码' }, { status: 400 });
      }

      const verifyResult = await verifyCode(email, verificationCode, 'register');
      if (!verifyResult.valid) {
        return NextResponse.json({ error: verifyResult.error || '验证码错误' }, { status: 400 });
      }

      // Invalidate the used code
      if (verifyResult.codeId) {
        await invalidateCode(verifyResult.codeId);
      }
    }

    // Create user
    const userId = createId();
    const now = new Date();
    await db.insert(users).values({
      id: userId,
      email,
      passwordHash: await hashPassword(password),
      name: name || email.split('@')[0],
      isAdmin: isFirstUser,
      isGuest: false,
      createdAt: now,
      updatedAt: now,
    });

    // Copy prompt templates for the new user
    const templates = db.select().from(promptTemplates).all();
    for (const tpl of templates) {
      await db.insert(promptTemplates).values({
        id: `${userId}-${tpl.id}`,
        name: tpl.name,
        description: tpl.description,
        content: tpl.content,
        defaultContent: tpl.defaultContent,
        providerId: tpl.providerId,
        userId: userId,
        updatedAt: now,
      });
    }

    // Set session
    const session = await getSession();
    session.userId = userId;
    session.isGuest = false;
    session.isAdmin = isFirstUser;
    await session.save();

    return NextResponse.json({
      user: {
        id: userId,
        email,
        name: name || email.split('@')[0],
        isAdmin: isFirstUser,
        isGuest: false,
      },
    });
  } catch (error) {
    console.error('[Auth] Register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
