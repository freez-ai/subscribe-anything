/**
 * analyzeAgent — generates an HTML analysis report for a subscription.
 *
 * Has access to the webFetch tool so the LLM can fetch linked URLs
 * when card summaries lack sufficient detail for deep analysis.
 *
 * Yields HTML string chunks via onChunk callback (for SSE streaming).
 * Reports LLM call info via onCall callback (for debug UI).
 */

import { getTemplate, getProviderForTemplate, buildOpenAIClient, llmStream, type LLMCallInfo } from '@/lib/ai/client';
import { webFetch, webFetchToolDef } from '@/lib/ai/tools/webFetch';
import type OpenAI from 'openai';

const MAX_ITERATIONS = 10; // guard against runaway tool loops

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
  onToolCall?: (name: string, detail: string) => void;
}

type Message = OpenAI.Chat.ChatCompletionMessageParam;

export async function analyzeAgent(
  input: AnalyzeInput,
  callbacks: AnalyzeAgentCallbacks,
  userId?: string | null
): Promise<void> {
  const { onChunk, onCall, onToolCall } = callbacks;
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

  // Tailor webFetch tool description for the analysis context
  const analyzeWebFetchToolDef = {
    ...webFetchToolDef,
    function: {
      ...webFetchToolDef.function,
      description:
        '抓取指定 URL 的网页内容。当卡片的标题和摘要信息不足以深入分析时，' +
        '使用此工具获取原文详情。HTML 会自动精简（移除脚本/样式），仅保留正文结构。' +
        '不要一次抓取过多链接，只抓取分析中最需要深入了解的关键条目（建议不超过 5 个）。',
    },
  };

  const messages: Message[] = [
    { role: 'user', content: systemContent },
  ];

  // Agentic loop: LLM may call webFetch to read linked articles, then generate report
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let textBuffer = '';
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();

    const stream = llmStream(
      openai,
      {
        model: provider.modelId,
        messages,
        tools: [analyzeWebFetchToolDef],
        tool_choice: 'auto',
        stream: true,
        stream_options: { include_usage: true },
      },
      { callIndex: iteration + 1, onCall }
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // Stream text content immediately
      if (delta?.content) {
        textBuffer += delta.content;
        onChunk(delta.content);
      }

      // Accumulate tool calls
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallMap.has(idx)) {
            toolCallMap.set(idx, { id: '', name: '', args: '' });
          }
          const entry = toolCallMap.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name += tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }
    }

    const toolCalls = Array.from(toolCallMap.values());

    // No tool calls → agent finished generating
    if (toolCalls.length === 0) {
      break;
    }

    // Append assistant turn with tool calls
    messages.push({
      role: 'assistant',
      content: textBuffer || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.args },
      })),
    } as Message);

    // Execute each tool call
    for (const tc of toolCalls) {
      let resultContent = '';

      try {
        const args = JSON.parse(tc.args || '{}');

        if (tc.name === 'webFetch') {
          const fetchUrl = args.url ?? '';
          onToolCall?.('webFetch', fetchUrl);
          const result = await webFetch(fetchUrl);
          resultContent = JSON.stringify({
            ok: result.ok,
            status: result.status,
            body: result.body,
          });
        } else {
          resultContent = JSON.stringify({ error: `未知工具: ${tc.name}` });
        }
      } catch (err) {
        resultContent = JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        });
      }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultContent,
      } as Message);
    }
  }
}
