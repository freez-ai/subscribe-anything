/**
 * analyzeAgent — generates an HTML analysis report for a subscription.
 *
 * No tools. Pure generation from message card data.
 * Yields HTML string chunks via onChunk callback (for SSE streaming).
 */

import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { promptTemplates } from '@/lib/db/schema';
import { getProviderForTemplate, buildOpenAIClient } from '@/lib/ai/client';

export interface AnalyzeInput {
  topic: string;
  criteria?: string | null;
  description: string; // user-supplied analysis question
  cards: Array<{
    title: string;
    summary?: string | null;
    publishedAt?: string | null;
    sourceName?: string;
    meetsCriteriaFlag?: boolean;
  }>;
}

export async function analyzeAgent(
  input: AnalyzeInput,
  onChunk: (html: string) => void
): Promise<void> {
  const provider = getProviderForTemplate('analyze-subscription');

  const db = getDb();
  const tplRow = db
    .select()
    .from(promptTemplates)
    .where(eq(promptTemplates.id, 'analyze-subscription'))
    .get();

  if (!tplRow) {
    onChunk('<p style="color:red">analyze-subscription 提示词模板未找到</p>');
    return;
  }

  // Summarize card data as text (title + summary only, keep tokens low)
  const cardsSummary = input.cards
    .map((c, i) => {
      const date = c.publishedAt ? ` (${c.publishedAt.slice(0, 10)})` : '';
      const flag = c.meetsCriteriaFlag ? ' ⚠️' : '';
      const summary = c.summary ? `\n  摘要: ${c.summary.slice(0, 200)}` : '';
      return `${i + 1}. ${c.title}${date}${flag}${summary}`;
    })
    .join('\n');

  const systemContent = tplRow.content
    .replace('{{topic}}', input.topic)
    .replace('{{criteria}}', input.criteria ?? '无');

  const userContent = `分析要求：${input.description}\n\n数据共 ${input.cards.length} 条：\n${cardsSummary}\n\n请用 HTML 格式输出分析报告（使用 <h2>, <p>, <ul>, <li>, <strong> 等标签，不要包含 <!DOCTYPE> 或 <html>/<body> 包装）。`;

  const openai = buildOpenAIClient(provider);

  const stream = await openai.chat.completions.create({
    model: provider.modelId,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
    stream: true,
    stream_options: { include_usage: true },
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? '';
    if (text) onChunk(text);
  }
}
