import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { oauthStates, oauthConfig } from '@/lib/db/schema';
import { createId } from '@paralleldrive/cuid2';

export async function GET(req: NextRequest) {
  const db = getDb();
  const config = db.select().from(oauthConfig).where(eq(oauthConfig.id, 'google')).get();

  if (!config?.enabled || !config.clientId || !config.clientSecret) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const redirectUrl = searchParams.get('redirect') || '/';

  // Generate state for CSRF protection
  const state = createId();
  const now = new Date();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db.insert(oauthStates).values({
    id: createId(),
    provider: 'google',
    state,
    redirectUrl,
    createdAt: now,
    expiresAt,
  });

  // Build Google OAuth URL
  const callbackUrl = new URL('/api/auth/oauth/google/callback', req.url);
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', config.clientId);
  googleAuthUrl.searchParams.set('redirect_uri', callbackUrl.toString());
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'email profile');
  googleAuthUrl.searchParams.set('state', state);

  return NextResponse.redirect(googleAuthUrl.toString());
}
