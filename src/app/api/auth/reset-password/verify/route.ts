import { getDb } from '@/lib/db';
import { passwordResetTokens } from '@/lib/db/schema';
import { eq, isNull } from 'drizzle-orm';

// POST /api/auth/reset-password/verify - verify reset token
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return Response.json({ valid: false, error: '令牌无效' });
    }

    const db = getDb();
    const now = new Date();

    const resetToken = db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .get();

    if (!resetToken) {
      return Response.json({ valid: false, error: '令牌无效' });
    }

    // Check if already used
    if (resetToken.usedAt) {
      return Response.json({ valid: false, error: '令牌已使用' });
    }

    // Check if expired
    if (resetToken.expiresAt < now) {
      return Response.json({ valid: false, error: '令牌已过期' });
    }

    return Response.json({ valid: true });
  } catch (err) {
    console.error('[Reset Password] Verify error:', err);
    return Response.json({ valid: false, error: '验证失败' }, { status: 500 });
  }
}
