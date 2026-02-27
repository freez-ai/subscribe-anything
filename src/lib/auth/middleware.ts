import { NextRequest, NextResponse } from 'next/server';
import { getSession, SessionData } from './session';

/**
 * Authentication error types
 */
export class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Wrapper for API route handlers that require authentication.
 * Catches AuthError and returns appropriate HTTP responses.
 */
export function withAuth<T>(
  handler: (req: NextRequest, session: SessionData) => Promise<T>
): (req: NextRequest) => Promise<T | NextResponse> {
  return async (req: NextRequest) => {
    try {
      const session = await getSession();
      if (!session.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return await handler(req, session);
    } catch (error) {
      if (error instanceof AuthError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error instanceof Error && error.message === 'FORBIDDEN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      throw error;
    }
  };
}

/**
 * Wrapper for API route handlers that require admin privileges.
 */
export function withAdmin<T>(
  handler: (req: NextRequest, session: SessionData) => Promise<T>
): (req: NextRequest) => Promise<T | NextResponse> {
  return withAuth(async (req, session) => {
    if (!session.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return handler(req, session);
  });
}
