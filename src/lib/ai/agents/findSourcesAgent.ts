/**
 * findSourcesAgent — Wizard Step 2
 *
 * Agentic loop that searches the web to find 5-10 high-quality data sources
 * for a given subscription topic.
 *
 * SSE events emitted:
 *   { type: 'text', content: string }            — LLM text delta
 *   { type: 'tool_call', name: string, args: any } — tool invocation started
 *   { type: 'tool_result', name: string, resultSummary: string } — result summary
 *   { type: 'sources', sources: FoundSource[] }  — final parsed source list
 *   { type: 'error', message: string }           — (emitted by sseStream on throw)
 */

import { getTemplate, getProviderForTemplate, buildOpenAIClient, llmStream } from '@/lib/ai/client';
import type { LLMCallInfo } from '@/lib/ai/client';
import { webSearch, webSearchToolDef } from '@/lib/ai/tools/webSearch';
import { rssRadar, rssRadarToolDef } from '@/lib/ai/tools/rssRadar';
import { checkFeed, checkFeedToolDef } from '@/lib/ai/tools/checkFeed';
import type OpenAI from 'openai';

export interface FoundSource {
  title: string;
  url: string;
  description: string;
  recommended?: boolean;
  canProvideCriteria?: boolean;
}

type Message = OpenAI.Chat.ChatCompletionMessageParam;

/** Run the find-sources agentic loop and emit SSE events via `emit`. */
export async function findSourcesAgent(
  { topic, criteria }: { topic: string; criteria?: string },
  emit: (event: unknown) => void,
  onLLMCall?: (info: LLMCallInfo) => void,
  userId?: string | null
): Promise<FoundSource[]> {
  const provider = getProviderForTemplate('find-sources', userId);

  const tpl = getTemplate('find-sources', userId);
  const systemContent = tpl.content
    .replace('{{topic}}', topic)
    .replace('{{criteria}}', criteria ?? '无');

  const messages: Message[] = [
    { role: 'user', content: systemContent },
  ];

  const openai = buildOpenAIClient(provider);
  let lastTextBuffer = '';
  let allTextBuffer = '';

  // Agentic loop — max 32 iterations to prevent runaway
  for (let iteration = 0; iteration < 32; iteration++) {
    let textBuffer = '';
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();

    const stream = llmStream(openai, {
      model: provider.modelId,
      messages,
      tools: [webSearchToolDef, rssRadarToolDef, checkFeedToolDef],
      tool_choice: 'auto',
      stream: true,
      stream_options: { include_usage: true },
    }, { callIndex: iteration + 1, onCall: onLLMCall });

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      const delta = choice?.delta;

      // Accumulate text
      if (delta?.content) {
        textBuffer += delta.content;
        emit({ type: 'text', content: delta.content });
      }

      // Accumulate tool calls (streamed in pieces)
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

    if (textBuffer) {
      lastTextBuffer = textBuffer;
      allTextBuffer += '\n' + textBuffer;
    }

    const toolCalls = Array.from(toolCallMap.values());

    // No tool calls → agent is done
    if (toolCalls.length === 0) break;

    // Append assistant turn to history
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
      emit({ type: 'tool_call', name: tc.name, args: JSON.parse(tc.args || '{}') });

      let resultContent = '';
      try {
        if (tc.name === 'rssRadar') {
          const queries: string[] = JSON.parse(tc.args).queries ?? [];
          const results = await Promise.all(queries.map((q) => rssRadar(q)));
          const combined = results.map((routes, i) => ({ query: queries[i], routes }));
          resultContent = JSON.stringify(combined);
          const total = results.reduce((s, r) => s + r.length, 0);
          emit({
            type: 'tool_result',
            name: 'rssRadar',
            resultSummary: `${queries.length} 个查询，共找到 ${total} 条 RSS 路由`,
            success: true,
          });
        } else if (tc.name === 'webSearch') {
          const { query } = JSON.parse(tc.args);

          // Check for no-provider error before hitting the API — throw so sseStream
          // catches it and emits { type: 'error' } for the client to display
          let results;
          try {
            results = await webSearch(query);
          } catch (searchErr) {
            const msg = searchErr instanceof Error ? searchErr.message : String(searchErr);
            // "No search provider" is a fatal config error — stop the agent entirely
            if (msg.toLowerCase().includes('search provider') || msg.toLowerCase().includes('no search')) {
              throw searchErr;
            }
            // Transient error — report to LLM and continue
            resultContent = JSON.stringify({ error: msg });
            emit({ type: 'tool_result', name: 'webSearch', resultSummary: `搜索出错: ${msg.slice(0, 60)}`, success: false });
            messages.push({ role: 'tool', tool_call_id: tc.id, content: resultContent } as Message);
            continue;
          }

          resultContent = JSON.stringify(results);
          emit({
            type: 'tool_result',
            name: 'webSearch',
            resultSummary: `找到 ${results.length} 条结果`,
            success: true,
          });
        } else if (tc.name === 'checkFeed') {
          const feeds: { url: string; keywords?: string[]; templateUrl?: string }[] =
            JSON.parse(tc.args).feeds ?? [];
          const results = await Promise.all(
            feeds.map((f) => checkFeed(f.url, f.keywords, f.templateUrl))
          );
          resultContent = JSON.stringify(results.map((r, i) => ({ url: feeds[i].url, ...r })));
          const validCount = results.filter((r) => r.valid).length;
          const summary = results.map((r, i) => {
            if (r.valid) return `✓ ${feeds[i].url}`;
            if (r.templateMismatch) return `✗ ${feeds[i].url} (结构有误)`;
            if (r.keywordFound === false) return `✗ ${feeds[i].url} (实体 ID 有误)`;
            return `✗ ${feeds[i].url} (HTTP ${r.status})`;
          }).join('\n');
          emit({
            type: 'tool_result',
            name: 'checkFeed',
            resultSummary: `${feeds.length} 个 feed，${validCount} 个有效\n${summary}`,
            success: validCount > 0,
          });
        } else {
        }
      } catch (err) {
        // Re-throw fatal errors (e.g. no search provider) — sseStream will emit error event
        throw err;
      }

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: resultContent,
      } as Message);
    }
  }

  // Parse final sources — try accumulated text first, then last buffer
  const sources = parseSourcesFromText(allTextBuffer) || parseSourcesFromText(lastTextBuffer);
  emit({ type: 'sources', sources });

  return sources;
}

/** Normalize a raw parsed item into a FoundSource. */
function normalizeSource(item: Record<string, unknown>): FoundSource {
  const recommended = item.recommended === true || item.recommended === 'true';
  const canProvideCriteria = item.canProvideCriteria === false || item.canProvideCriteria === 'false'
    ? false
    : item.canProvideCriteria === true || item.canProvideCriteria === 'true'
      ? true
      : undefined;
  return {
    title: String(item.title ?? item.name ?? item.url),
    url: String(item.url),
    description: String(item.description ?? item.summary ?? ''),
    ...(recommended ? { recommended: true } : {}),
    ...(canProvideCriteria !== undefined ? { canProvideCriteria } : {}),
  };
}

/** Try JSON.parse on a string and return a valid FoundSource array or []. */
function tryParseJsonArray(raw: string): FoundSource[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.url === 'string' && item.url.startsWith('http'))
      .map(normalizeSource);
  } catch {
    return [];
  }
}

/** Extract JSON array of sources from agent's final text response. */
function parseSourcesFromText(text: string): FoundSource[] {
  if (!text) return [];

  // 1. JSON inside a code block: ```json [...] ``` or ``` [...] ```
  const codeBlockMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  if (codeBlockMatch) {
    const result = tryParseJsonArray(codeBlockMatch[1]);
    if (result.length > 0) return result;
  }

  // 2. Bare JSON array anywhere in the text (greedy from first [ to last ])
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const result = tryParseJsonArray(text.slice(firstBracket, lastBracket + 1));
    if (result.length > 0) return result;
  }

  // 3. Individual JSON objects containing a url field (LLM may output one object per line)
  const objectPattern = /\{[^{}]*"url"\s*:\s*"(https?:\/\/[^"]+)"[^{}]*\}/g;
  const objects: FoundSource[] = [];
  for (const match of text.matchAll(objectPattern)) {
    try {
      const obj = JSON.parse(match[0]) as Record<string, unknown>;
      if (typeof obj.url === 'string' && obj.url.startsWith('http')) {
        objects.push(normalizeSource(obj));
      }
    } catch {
      // skip malformed
    }
  }
  if (objects.length > 0) return objects;

  // 4. Markdown list fallback — extract URLs from lines like "- **Title** — https://..."
  const urlLinePattern = /[-*]\s+(?:\*{1,2}([^*\n]+)\*{1,2}[^:\n]*)?.*?(https?:\/\/[^\s)\]"]+)/g;
  const markdownSources: FoundSource[] = [];
  for (const match of text.matchAll(urlLinePattern)) {
    const title = (match[1] ?? '').trim();
    const url = match[2].replace(/[,.)]+$/, ''); // strip trailing punctuation
    if (url.startsWith('http')) {
      markdownSources.push({ title: title || url, url, description: '' });
    }
  }
  if (markdownSources.length > 0) return markdownSources;

  return [];
}
