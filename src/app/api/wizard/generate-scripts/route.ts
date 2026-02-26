import { sseStream } from '@/lib/utils/streamResponse';
import { generateScriptAgent } from '@/lib/ai/agents/generateScriptAgent';

export interface SourceToGenerate {
  title: string;
  url: string;
  description: string;
  userPrompt?: string;
}

// POST /api/wizard/generate-scripts — SSE stream
// Body: { sources: SourceToGenerate[], criteria?: string }
// Emits: { type: 'source_progress', sourceIndex, status, script?, items?, error? }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { sources, criteria } = body as { sources?: SourceToGenerate[]; criteria?: string };

  if (!Array.isArray(sources) || sources.length === 0) {
    return Response.json({ error: 'sources array is required' }, { status: 400 });
  }

  return sseStream(async (emit) => {
    // Kick off all sources in parallel; each one streams progress events independently
    await Promise.all(
      sources.map(async (source, i) => {
        emit({ type: 'source_progress', sourceIndex: i, status: 'generating', message: 'AI 正在分析数据源...' });

        try {
          const result = await generateScriptAgent(
            {
              ...source,
              criteria: criteria?.trim() || undefined,
              userPrompt: source.userPrompt?.trim() || undefined,
            },
            (message) => {
              emit({ type: 'source_progress', sourceIndex: i, status: 'generating', message });
            },
            (info) => {
              emit({ type: 'source_progress', sourceIndex: i, status: 'llm_call', llmCall: info });
            }
          );

          if (result.success) {
            emit({
              type: 'source_progress',
              sourceIndex: i,
              status: 'success',
              script: result.script,
              cronExpression: result.cronExpression,
              items: result.initialItems,
            });
          } else if (result.sandboxUnavailable) {
            emit({
              type: 'source_progress',
              sourceIndex: i,
              status: 'unverified',
              script: result.script,
              cronExpression: result.cronExpression,
              items: [],
            });
          } else {
            emit({
              type: 'source_progress',
              sourceIndex: i,
              status: 'failed',
              script: result.script,
              error: result.error,
            });
          }
        } catch (err) {
          emit({
            type: 'source_progress',
            sourceIndex: i,
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );

    emit({ type: 'done' });
  });
}
