import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import { abortSource } from '@/lib/managed/pipeline';

// POST /api/subscriptions/[id]/abort-source
// Body: { sourceUrl: string }
// Immediately marks the source as aborted (writes error log) so the frontend shows it as failed.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const { sourceUrl } = body as { sourceUrl?: string };

    if (!sourceUrl) {
      return Response.json({ error: 'sourceUrl is required' }, { status: 400 });
    }

    const db = getDb();
    const sub = db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.userId)))
      .get();

    if (!sub) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    abortSource(id, sourceUrl);

    return Response.json({ aborted: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[abort-source POST]', err);
    return Response.json({ error: 'Failed to abort source' }, { status: 500 });
  }
}
