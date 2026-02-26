import { eq, desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, messageCards, sources } from '@/lib/db/schema';
import { sseStream } from '@/lib/utils/streamResponse';
import { analyzeAgent } from '@/lib/ai/agents/analyzeAgent';

// POST /api/subscriptions/[id]/analyze
// Body: { description: string, limit?: number }
// Streams: { type:'chunk', html } … { type:'done' }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const sub = db.select().from(subscriptions).where(eq(subscriptions.id, id)).get();
  if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { description?: string; limit?: number };
  const description = typeof body.description === 'string' && body.description.trim()
    ? body.description.trim()
    : '请对这些数据进行综合分析，总结规律、趋势和亮点';
  const cardLimit = Math.min(100, Math.max(1, body.limit ?? 50));

  // Fetch cards — title + summary + publishedAt + source name, newest first
  const cards = db
    .select({
      title: messageCards.title,
      summary: messageCards.summary,
      publishedAt: messageCards.publishedAt,
      sourceName: sources.title,
      meetsCriteriaFlag: messageCards.meetsCriteriaFlag,
    })
    .from(messageCards)
    .innerJoin(sources, eq(messageCards.sourceId, sources.id))
    .where(eq(messageCards.subscriptionId, id))
    .orderBy(desc(messageCards.createdAt))
    .limit(cardLimit)
    .all();

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
          meetsCriteriaFlag: c.meetsCriteriaFlag,
        })),
      },
      (html) => emit({ type: 'chunk', html })
    );
    emit({ type: 'done' });
  });
}
