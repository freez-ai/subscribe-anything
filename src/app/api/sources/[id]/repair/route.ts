import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sources, subscriptions } from '@/lib/db/schema';
import { sseStream } from '@/lib/utils/streamResponse';
import { repairScriptAgent } from '@/lib/ai/agents/repairScriptAgent';
import { requireAuth } from '@/lib/auth';

// POST /api/sources/[id]/repair — SSE streaming repair agent
// On success emits: { type:'success', script }
// On failure emits: { type:'failed', reason, script? }
// Does NOT auto-apply the fix — UI confirms before PATCH
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    // Verify source belongs to user via subscription
    const result = db.select()
      .from(sources)
      .innerJoin(subscriptions, eq(sources.subscriptionId, subscriptions.id))
      .where(and(eq(sources.id, id), eq(subscriptions.userId, session.userId)))
      .get();

    if (!result) {
      return Response.json({ error: 'Source not found' }, { status: 404 });
    }

    const source = result.sources;

    return sseStream(async (emit) => {
      emit({ type: 'start', sourceId: id, sourceTitle: source.title });

      const agentResult = await repairScriptAgent(
        {
          url: source.url,
          script: source.script,
          lastError: source.lastError ?? '未知错误',
        },
        (message) => emit({ type: 'progress', message }),
        (info) => emit({ type: 'llm_call', ...info })
      );

      if (agentResult.success && agentResult.script) {
        emit({ type: 'success', script: agentResult.script });
      } else {
        emit({ type: 'failed', reason: agentResult.reason, script: agentResult.script });
      }

      emit({ type: 'done' });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[sources/[id]/repair POST]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
