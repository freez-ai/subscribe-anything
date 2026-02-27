import { eq, desc, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, messageCards, sources } from '@/lib/db/schema';
import { sseStream } from '@/lib/utils/streamResponse';
import { analyzeAgent } from '@/lib/ai/agents/analyzeAgent';
import type { LLMCallInfo } from '@/lib/ai/client';

// POST /api/subscriptions/[id]/analyze
// Body: { description: string, limit?: number, cardIds?: string[] }
// Streams: { type:'llm_call', ...info } … { type:'chunk', html } … { type:'done' }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const sub = db.select().from(subscriptions).where(eq(subscriptions.id, id)).get();
  if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as {
    description?: string;
    limit?: number;
    cardIds?: string[];
  };
  const description = typeof body.description === 'string' && body.description.trim()
    ? body.description.trim()
    : '请对这些数据进行综合分析，总结规律、趋势和亮点';

  // Fetch cards — either by specific IDs or by limit
  let cards: Array<{
    title: string;
    summary: string | null;
    publishedAt: Date | null;
    sourceName: string | null;
    sourceUrl: string | null;
    meetsCriteriaFlag: boolean;
  }>;

  if (body.cardIds && Array.isArray(body.cardIds) && body.cardIds.length > 0) {
    // Mode 1: Analyze specific card IDs (max 100)
    const limitedCardIds = body.cardIds.slice(0, 100);
    cards = db
      .select({
        title: messageCards.title,
        summary: messageCards.summary,
        publishedAt: messageCards.publishedAt,
        sourceName: sources.title,
        sourceUrl: messageCards.sourceUrl,
        meetsCriteriaFlag: messageCards.meetsCriteriaFlag,
      })
      .from(messageCards)
      .innerJoin(sources, eq(messageCards.sourceId, sources.id))
      .where(inArray(messageCards.id, limitedCardIds))
      .all();
  } else {
    // Mode 2: Analyze most recent N cards
    const cardLimit = Math.min(100, Math.max(1, body.limit ?? 50));
    cards = db
      .select({
        title: messageCards.title,
        summary: messageCards.summary,
        publishedAt: messageCards.publishedAt,
        sourceName: sources.title,
        sourceUrl: messageCards.sourceUrl,
        meetsCriteriaFlag: messageCards.meetsCriteriaFlag,
      })
      .from(messageCards)
      .innerJoin(sources, eq(messageCards.sourceId, sources.id))
      .where(eq(messageCards.subscriptionId, id))
      .orderBy(desc(messageCards.createdAt))
      .limit(cardLimit)
      .all();
  }

  if (cards.length === 0) {
    return Response.json({ error: '暂无数据可分析' }, { status: 400 });
  }

  return sseStream(async (emit) => {
    await analyzeAgent(
      {
        topic: sub.topic,
        criteria: sub.criteria,
        description,
        cards: cards.map((c) => ({
          title: c.title,
          summary: c.summary,
          publishedAt: c.publishedAt ? new Date(c.publishedAt).toISOString() : null,
          sourceName: c.sourceName ?? undefined,
          sourceUrl: c.sourceUrl,
          meetsCriteriaFlag: c.meetsCriteriaFlag,
        })),
      },
      {
        onChunk: (html) => emit({ type: 'chunk', html }),
        onCall: (info: LLMCallInfo) => emit({ type: 'llm_call', ...info }),
      }
    );
    emit({ type: 'done' });
  });
}
