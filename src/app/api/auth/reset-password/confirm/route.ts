import { getDb } from '@/lib/db';
import { users, passwordResetTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/password';

// POST /api/auth/reset-password/confirm - confirm password reset
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return Response.json({ error: '请提供令牌和新密码' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return Response.json({ error: '密码至少需要 6 个字符' }, { status: 400 });
    }

    const db = getDb();
    const now = new Date();

    const resetToken = db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .get();

    if (!resetToken) {
      return Response.json({ error: '令牌无效' }, { status: 400 });
    }

    // Check if already used
    if (resetToken.usedAt) {
      return Response.json({ error: '令牌已使用' }, { status: 400 });
    }

    // Check if expired
    if (resetToken.expiresAt < now) {
      return Response.json({ error: '令牌已过期' }, { status: 400 });
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user password
    db.update(users)
      .set({ passwordHash, updatedAt: now })
      .where(eq(users.id, resetToken.userId))
      .run();

    // Mark token as used
    db.update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, resetToken.id))
      .run();

    return Response.json({ success: true });
  } catch (err) {
    console.error('[Reset Password] Confirm error:', err);
    return Response.json({ error: '重置密码失败' }, { status: 500 });
  }
}
