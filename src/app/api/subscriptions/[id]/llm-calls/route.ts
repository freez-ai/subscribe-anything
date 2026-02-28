import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import { getLLMCalls } from '@/lib/managed/llmCallStore';

// GET /api/subscriptions/[id]/llm-calls
// Returns in-memory LLM call debug info for the subscription.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    const sub = db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .get();

    if (!sub || sub.userId !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    return Response.json({ calls: getLLMCalls(id) });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[llm-calls GET]', err);
    return Response.json({ error: 'Failed to get LLM calls' }, { status: 500 });
  }
}
