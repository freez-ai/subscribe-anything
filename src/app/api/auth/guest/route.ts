import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getSession } from '@/lib/auth';
import { GUEST_USER_ID } from '@/lib/db/migrate';

export async function POST() {
  try {
    const session = await getSession();

    // Already logged in - return current user
    if (session.userId) {
      const db = getDb();
      const user = db.select().from(users).where(eq(users.id, session.userId)).get();
      if (user) {
        return NextResponse.json({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin,
            isGuest: user.isGuest,
          },
        });
      }
    }

    // Create guest session
    const db = getDb();

    // Ensure guest user exists
    let guestUser = db.select().from(users).where(eq(users.id, GUEST_USER_ID)).get();
    if (!guestUser) {
      const now = new Date();
      await db.insert(users).values({
        id: GUEST_USER_ID,
        isGuest: true,
        isAdmin: false,
        name: 'Guest',
        createdAt: now,
        updatedAt: now,
      });
      guestUser = db.select().from(users).where(eq(users.id, GUEST_USER_ID)).get();
    }

    // Set session as guest
    session.userId = GUEST_USER_ID;
    session.isGuest = true;
    session.isAdmin = false;
    await session.save();

    return NextResponse.json({
      user: {
        id: GUEST_USER_ID,
        name: 'Guest',
        isAdmin: false,
        isGuest: true,
      },
    });
  } catch (error) {
    console.error('[Auth] Guest login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
