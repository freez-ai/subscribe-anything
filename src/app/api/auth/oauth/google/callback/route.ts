import { NextRequest, NextResponse } from 'next/server';
import { eq, and, gt } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users, oauthStates, promptTemplates, oauthConfig } from '@/lib/db/schema';
import { getSession } from '@/lib/auth';
import { createId } from '@paralleldrive/cuid2';
import { sql } from 'drizzle-orm';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function getCallbackUrl(req: NextRequest): string {
  if (process.env.APP_URL) {
    return `${process.env.APP_URL.replace(/\/$/, '')}/api/auth/oauth/google/callback`;
  }
  const proto = req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  return `${proto}://${host}/api/auth/oauth/google/callback`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('[OAuth] Google OAuth error:', error);
      return NextResponse.redirect(new URL('/login?error=oauth_failed', req.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/login?error=invalid_request', req.url));
    }

    const db = getDb();

    // Read credentials from DB (fall back to env for backwards compat)
    const config = db.select().from(oauthConfig).where(eq(oauthConfig.id, 'google')).get();
    const clientId = config?.clientId || GOOGLE_CLIENT_ID;
    const clientSecret = config?.clientSecret || GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL('/login?error=oauth_not_configured', req.url));
    }

    // Verify state
    const stateRecord = db
      .select()
      .from(oauthStates)
      .where(and(eq(oauthStates.state, state), gt(oauthStates.expiresAt, new Date())))
      .get();

    if (!stateRecord) {
      return NextResponse.redirect(new URL('/login?error=invalid_state', req.url));
    }

    // Delete used state
    await db.delete(oauthStates).where(eq(oauthStates.id, stateRecord.id));

    // Exchange code for tokens
    const callbackUrl = getCallbackUrl(req);
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl.toString(),
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      console.error('[OAuth] Token exchange failed');
      return NextResponse.redirect(new URL('/login?error=token_exchange_failed', req.url));
    }

    const tokens = await tokenResponse.json();

    // Get user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userResponse.ok) {
      console.error('[OAuth] Failed to get user info');
      return NextResponse.redirect(new URL('/login?error=user_info_failed', req.url));
    }

    const googleUser = await userResponse.json();

    // Check if user exists by googleId
    let user = db.select().from(users).where(eq(users.googleId, googleUser.id)).get();

    if (!user && googleUser.email) {
      // Check if user exists by email (might have registered with password)
      user = db.select().from(users).where(eq(users.email, googleUser.email)).get();

      if (user) {
        // Link Google account to existing user
        await db
          .update(users)
          .set({ googleId: googleUser.id, updatedAt: new Date() })
          .where(eq(users.id, user.id));
        user = { ...user, googleId: googleUser.id };
      }
    }

    if (!user) {
      // Check if this is the first non-guest user (will be admin)
      const userCountResult = db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.isGuest, false))
        .get();
      const isFirstUser = (userCountResult?.count ?? 0) === 0;

      // Create new user
      const userId = createId();
      const now = new Date();
      await db.insert(users).values({
        id: userId,
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
        googleId: googleUser.id,
        isAdmin: isFirstUser,
        isGuest: false,
        createdAt: now,
        updatedAt: now,
      });

      user = {
        id: userId,
        email: googleUser.email,
        name: googleUser.name,
        avatarUrl: googleUser.picture,
        googleId: googleUser.id,
        isAdmin: isFirstUser,
        isGuest: false,
        createdAt: now,
        updatedAt: now,
        passwordHash: null,
      };

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
    }

    // Set session
    const session = await getSession();
    session.userId = user.id;
    session.isGuest = user.isGuest ?? false;
    session.isAdmin = user.isAdmin ?? false;
    await session.save();

    // Redirect to original URL or home
    const redirectUrl = stateRecord.redirectUrl || '/';
    return NextResponse.redirect(new URL(redirectUrl, req.url));
  } catch (error) {
    console.error('[OAuth] Callback error:', error);
    return NextResponse.redirect(new URL('/login?error=internal_error', req.url));
  }
}
