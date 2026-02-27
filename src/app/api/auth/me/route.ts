import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();

    if (!session.userId) {
      return NextResponse.json({ user: null });
    }

    const db = getDb();
    const user = db.select().from(users).where(eq(users.id, session.userId)).get();

    if (!user) {
      // Session has invalid user ID, destroy it
      session.destroy();
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
        isGuest: user.isGuest,
      },
    });
  } catch (error) {
    console.error('[Auth] Me error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
