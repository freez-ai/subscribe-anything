/**
 * analyzeAgent — generates an HTML analysis report for a subscription.
 *
 * No tools. Pure generation from message card data.
 * Yields HTML string chunks via onChunk callback (for SSE streaming).
 * Reports LLM call info via onCall callback (for debug UI).
 */

import { getTemplate, getProviderForTemplate, buildOpenAIClient, llmStream, type LLMCallInfo } from '@/lib/ai/client';

export interface AnalyzeInput {
  topic: string;
  criteria?: string | null;
  description: string; // user-supplied analysis question
  cards: Array<{
    title: string;
    summary?: string | null;
    publishedAt?: string | null;
    sourceName?: string;
    sourceUrl?: string | null;
    meetsCriteriaFlag?: boolean;
  }>;
}

export interface AnalyzeAgentCallbacks {
  onChunk: (html: string) => void;
  onCall?: (info: LLMCallInfo) => void;
}

export async function analyzeAgent(
  input: AnalyzeInput,
  callbacks: AnalyzeAgentCallbacks,
  userId?: string | null
): Promise<void> {
  const { onChunk, onCall } = callbacks;
  const provider = getProviderForTemplate('analyze-subscription', userId);
  const tpl = getTemplate('analyze-subscription', userId);

  if (!tpl) {
    onChunk('<p style="color:red">analyze-subscription 提示词模板未找到</p>');
    return;
  }

  // Format card data as JSON
  const cardsJson = JSON.stringify(
    input.cards.map((c, i) => ({
      index: i + 1,
      title: c.title,
      summary: c.summary?.slice(0, 300) || null,
      publishedAt: c.publishedAt ? c.publishedAt.slice(0, 10) : null,
      source: c.sourceName || null,
      url: c.sourceUrl || null,
      meetsCriteria: c.meetsCriteriaFlag || false,
    })),
    null,
    2
  );

  // Replace all template variables
  const systemContent = tpl.content
    .replace(/\{\{topic\}\}/g, input.topic)
    .replace(/\{\{criteria\}\}/g, input.criteria ?? '无')
    .replace(/\{\{count\}\}/g, String(input.cards.length))
    .replace(/\{\{analysisRequest\}\}/g, input.description)
    .replace(/\{\{data\}\}/g, cardsJson);

  const openai = buildOpenAIClient(provider);

  const stream = llmStream(
    openai,
    {
      model: provider.modelId,
      messages: [
        { role: 'user', content: systemContent },
      ],
      stream: true,
      stream_options: { include_usage: true },
    },
    { callIndex: 1, onCall }
  );

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? '';
    if (text) onChunk(text);
  }
}
