import { eq, desc, and, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, messageCards, sources, analysisReports } from '@/lib/db/schema';
import { sseStream } from '@/lib/utils/streamResponse';
import { analyzeAgent } from '@/lib/ai/agents/analyzeAgent';
import type { LLMCallInfo } from '@/lib/ai/client';
import { requireAuth } from '@/lib/auth';

// POST /api/subscriptions/[id]/analyze
// Body: { description: string, limit?: number, cardIds?: string[] }
// Streams: { type:'llm_call', ...info } … { type:'chunk', html } … { type:'done', reportId }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    const sub = db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.userId)))
      .get();
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
        .innerJoin(subscriptions, eq(messageCards.subscriptionId, subscriptions.id))
        .where(and(
          inArray(messageCards.id, limitedCardIds),
          eq(subscriptions.userId, session.userId)
        ))
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

    // Create a report with 'generating' status before streaming
    const report = db.insert(analysisReports).values({
      subscriptionId: id,
      userId: session.userId,
      title: '分析报告中...',
      description: description || null,
      htmlContent: '',
      cardCount: cards.length,
      status: 'generating',
    }).returning({ id: analysisReports.id }).get();

    const reportId = report.id;

    return sseStream(async (emit) => {
      let accumulatedHtml = '';

      try {
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
            onChunk: (html) => {
              accumulatedHtml += html;
              emit({ type: 'chunk', html });
            },
            onCall: (info: LLMCallInfo) => emit({ type: 'llm_call', ...info }),
            onToolCall: (name, detail) => emit({ type: 'tool_call', name, detail }),
          },
          session.userId
        );

        // Extract title from HTML: first <h1> or first line of text
        let title = '分析报告';
        const h1Match = accumulatedHtml.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (h1Match) {
          title = h1Match[1].replace(/<[^>]*>/g, '').trim();
        } else {
          const textMatch = accumulatedHtml.replace(/<[^>]*>/g, ' ').trim();
          if (textMatch) {
            title = textMatch.slice(0, 80);
          }
        }

        // Update report with completed status
        db.update(analysisReports)
          .set({
            title,
            htmlContent: accumulatedHtml,
            status: 'completed',
          })
          .where(eq(analysisReports.id, reportId))
          .run();

        emit({ type: 'done', reportId });
      } catch (err) {
        console.error('[analyze background]', err);
        // Update report with failed status
        db.update(analysisReports)
          .set({
            status: 'failed',
            error: err instanceof Error ? err.message : '生成失败',
          })
          .where(eq(analysisReports.id, reportId))
          .run();

        emit({ type: 'error', message: err instanceof Error ? err.message : '生成失败' });
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[subscriptions/[id]/analyze POST]', err);
    return Response.json({ error: 'Failed to analyze' }, { status: 500 });
  }
}
