import { getDb } from '@/lib/db';
import { emailVerificationCodes } from '@/lib/db/schema';
import { eq, and, isNull, gt, lt } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

const CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const CODE_COOLDOWN_MS = 60 * 1000; // 60 seconds between sends

export type VerificationType = 'register';

/**
 * Generate a 6-digit random verification code
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Create a new verification code for an email
 * Returns null if a code was sent recently (within cooldown period)
 */
export async function createVerificationCode(
  email: string,
  type: VerificationType = 'register'
): Promise<{ code: string; id: string } | { error: string }> {
  const db = getDb();
  const now = new Date();

  // Check if there's a recent code (within cooldown)
  const recentCode = db
    .select()
    .from(emailVerificationCodes)
    .where(
      and(
        eq(emailVerificationCodes.email, email),
        eq(emailVerificationCodes.type, type),
        gt(emailVerificationCodes.createdAt, new Date(now.getTime() - CODE_COOLDOWN_MS))
      )
    )
    .get();

  if (recentCode) {
    const remainingSeconds = Math.ceil(
      (recentCode.createdAt.getTime() + CODE_COOLDOWN_MS - now.getTime()) / 1000
    );
    return { error: `请等待 ${remainingSeconds} 秒后再试` };
  }

  // Invalidate any existing unused codes for this email
  db.delete(emailVerificationCodes)
    .where(
      and(
        eq(emailVerificationCodes.email, email),
        eq(emailVerificationCodes.type, type),
        isNull(emailVerificationCodes.usedAt)
      )
    )
    .run();

  // Create new code
  const code = generateVerificationCode();
  const id = createId();
  const expiresAt = new Date(now.getTime() + CODE_EXPIRY_MS);

  db.insert(emailVerificationCodes)
    .values({
      id,
      email,
      code,
      type,
      expiresAt,
      createdAt: now,
    })
    .run();

  return { code, id };
}

/**
 * Verify a verification code
 * Returns true if valid, false otherwise
 */
export async function verifyCode(
  email: string,
  code: string,
  type: VerificationType = 'register'
): Promise<{ valid: boolean; error?: string; codeId?: string }> {
  const db = getDb();
  const now = new Date();

  // Find the code
  const record = db
    .select()
    .from(emailVerificationCodes)
    .where(
      and(
        eq(emailVerificationCodes.email, email),
        eq(emailVerificationCodes.code, code),
        eq(emailVerificationCodes.type, type),
        isNull(emailVerificationCodes.usedAt)
      )
    )
    .get();

  if (!record) {
    return { valid: false, error: '验证码错误或已使用' };
  }

  // Check if expired
  if (record.expiresAt < now) {
    return { valid: false, error: '验证码已过期，请重新获取' };
  }

  return { valid: true, codeId: record.id };
}

/**
 * Mark a verification code as used
 */
export async function invalidateCode(codeId: string): Promise<void> {
  const db = getDb();
  const now = new Date();

  db.update(emailVerificationCodes)
    .set({ usedAt: now })
    .where(eq(emailVerificationCodes.id, codeId))
    .run();
}

/**
 * Clean up expired verification codes (can be called periodically)
 */
export async function cleanupExpiredCodes(): Promise<void> {
  const db = getDb();
  const now = new Date();

  db.delete(emailVerificationCodes)
    .where(lt(emailVerificationCodes.expiresAt, now))
    .run();
}
