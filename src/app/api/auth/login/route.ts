import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getSession, verifyPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const db = getDb();

    // Find user by email
    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Set session
    const session = await getSession();
    session.userId = user.id;
    session.isGuest = user.isGuest ?? false;
    session.isAdmin = user.isAdmin ?? false;
    await session.save();

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        isGuest: user.isGuest,
      },
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
