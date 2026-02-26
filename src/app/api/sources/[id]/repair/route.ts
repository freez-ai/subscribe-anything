import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sources } from '@/lib/db/schema';
import { sseStream } from '@/lib/utils/streamResponse';
import { repairScriptAgent } from '@/lib/ai/agents/repairScriptAgent';

// POST /api/sources/[id]/repair — SSE streaming repair agent
// On success emits: { type:'success', script }
// On failure emits: { type:'failed', reason, script? }
// Does NOT auto-apply the fix — UI confirms before PATCH
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const source = db.select().from(sources).where(eq(sources.id, id)).get();
  if (!source) {
    return Response.json({ error: 'Source not found' }, { status: 404 });
  }

  return sseStream(async (emit) => {
    emit({ type: 'start', sourceId: id, sourceTitle: source.title });

    const result = await repairScriptAgent(
      {
        url: source.url,
        script: source.script,
        lastError: source.lastError ?? '未知错误',
      },
      (message) => emit({ type: 'progress', message }),
      (info) => emit({ type: 'llm_call', ...info })
    );

    if (result.success && result.script) {
      emit({ type: 'success', script: result.script });
    } else {
      emit({ type: 'failed', reason: result.reason, script: result.script });
    }

    emit({ type: 'done' });
  });
}
