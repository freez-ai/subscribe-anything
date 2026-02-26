import { sseStream } from '@/lib/utils/streamResponse';
import { findSourcesAgent } from '@/lib/ai/agents/findSourcesAgent';

// POST /api/wizard/find-sources — SSE stream
// Body: { topic: string; criteria?: string }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { topic, criteria } = body as { topic?: string; criteria?: string };

  if (!topic?.trim()) {
    return Response.json({ error: 'topic is required' }, { status: 400 });
  }

  return sseStream(async (emit) => {
    await findSourcesAgent(
      { topic: topic.trim(), criteria: criteria?.trim() },
      emit,
      (info) => emit({ type: 'llm_call', ...info })
    );
    emit({ type: 'done' });
  });
}
