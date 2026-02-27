import { sseStream } from '@/lib/utils/streamResponse';
import { findSourcesAgent } from '@/lib/ai/agents/findSourcesAgent';
import { requireAuth } from '@/lib/auth';

// POST /api/wizard/find-sources — SSE stream
// Body: { topic: string; criteria?: string }
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const { topic, criteria } = body as { topic?: string; criteria?: string };

    if (!topic?.trim()) {
      return Response.json({ error: 'topic is required' }, { status: 400 });
    }

    return sseStream(async (emit) => {
      await findSourcesAgent(
        { topic: topic.trim(), criteria: criteria?.trim() },
        emit,
        (info) => emit({ type: 'llm_call', ...info }),
        session.userId
      );
      emit({ type: 'done' });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[wizard/find-sources POST]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
