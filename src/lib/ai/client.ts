/**
 * OpenAI-compatible client factory.
 *
 * Reads the active LLM provider from the database and creates an OpenAI instance
 * configured to point at that provider's base URL, API key, and optional headers.
 * Compatible with any OpenAI-compatible API: OpenAI, Ollama, Groq, etc.
 */

import OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { llmProviders, promptTemplates } from '@/lib/db/schema';

export type LLMProvider = typeof llmProviders.$inferSelect;

/** One LLM request/response pair, forwarded to the UI over SSE. */
export interface LLMCallInfo {
  callIndex: number;
  model: string;
  /** Normalized messages sent in the request. */
  messages: Array<{ role: string; content: string }>;
  /** Tool names available in this call. */
  tools: string[];
  /** Accumulated text from the response (may be empty if tool_calls only). */
  responseText: string;
  /** Tool calls the model chose to make. */
  toolCalls: Array<{ name: string; args: string }>;
  usage?: { prompt: number; completion: number; total: number };
  /** True while the LLM call is still in progress (streaming). */
  streaming?: boolean;
}

/** Returns the active LLM provider record, or null if none is set. */
export function getActiveProvider(): LLMProvider | null {
  const db = getDb();
  return (
    db.select().from(llmProviders).where(eq(llmProviders.isActive, true)).get() ??
    null
  );
}

/**
 * Returns the provider pinned to the given prompt template, falling back to
 * the globally active provider. Throws if no provider is available.
 */
export function getProviderForTemplate(templateId: string): LLMProvider {
  const db = getDb();
  const tpl = db
    .select({ providerId: promptTemplates.providerId })
    .from(promptTemplates)
    .where(eq(promptTemplates.id, templateId))
    .get();

  if (tpl?.providerId) {
    const pinned = db
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.id, tpl.providerId))
      .get();
    if (pinned) return pinned;
  }

  const active = getActiveProvider();
  if (!active) {
    throw new Error(
      'No active LLM provider configured. ' +
        'Please go to Settings → AI 供应商 and add/activate a provider.'
    );
  }
  return active;
}

/** Creates an OpenAI client from a specific provider record. */
export function buildOpenAIClient(provider: LLMProvider): OpenAI {
  let extraHeaders: Record<string, string> = {};
  if (provider.headers) {
    try {
      extraHeaders = JSON.parse(provider.headers);
    } catch {
      // ignore malformed headers JSON
    }
  }
  return new OpenAI({
    baseURL: provider.baseUrl,
    apiKey: provider.apiKey,
    defaultHeaders: extraHeaders,
  });
}

/**
 * Returns an OpenAI client configured for the active provider.
 * Throws a user-friendly error if no provider is active.
 */
export function getOpenAIClient(): OpenAI {
  const provider = getActiveProvider();
  if (!provider) {
    throw new Error(
      'No active LLM provider configured. ' +
        'Please go to Settings → AI 供应商 and add/activate a provider.'
    );
  }
  return buildOpenAIClient(provider);
}

/** Normalize raw OpenAI message params to plain { role, content } pairs. */
function normalizeMessages(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Array<{ role: string; content: string }> {
  return messages.map((msg) => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }
    if (Array.isArray(msg.content)) {
      return {
        role: msg.role,
        content: msg.content
          .map((p) => ('text' in p ? (p as { text: string }).text : '[non-text]'))
          .join(' '),
      };
    }
    if ('tool_calls' in msg && Array.isArray(msg.tool_calls)) {
      return {
        role: msg.role,
        content: msg.tool_calls
          .filter((tc) => 'function' in tc)
          .map((tc) => {
            const f = (tc as { function: { name: string; arguments: string } }).function;
            return `${f.name}(${f.arguments})`;
          })
          .join('; '),
      };
    }
    return { role: msg.role, content: JSON.stringify(msg) };
  });
}

/**
 * Drop-in replacement for `openai.chat.completions.create({ stream: true })`.
 * Yields chunks transparently.
 *
 * Fires `options.onCall` three times:
 *   1. At the START of the call (streaming: true, empty response) — so the UI
 *      can show the call immediately before any data arrives.
 *   2. Periodically during streaming (~400 ms throttle) with accumulated data.
 *   3. Once at the END with the complete response (streaming: false).
 */
export async function* llmStream(
  openai: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
  options?: { callIndex?: number; onCall?: (info: LLMCallInfo) => void }
): AsyncGenerator<OpenAI.Chat.ChatCompletionChunk> {
  const callIndex = options?.callIndex ?? 1;
  const onCall = options?.onCall;

  const normalizedMessages = normalizeMessages(params.messages);
  const availableTools = (params.tools ?? [])
    .filter((t) => 'function' in t)
    .map((t) => (t as { function: { name: string } }).function.name);

  // 1. Emit at START so the UI shows the call before any tokens arrive
  onCall?.({
    callIndex,
    model: params.model,
    messages: normalizedMessages,
    tools: availableTools,
    responseText: '',
    toolCalls: [],
    streaming: true,
  });

  const stream = await openai.chat.completions.create(params);

  let textAcc = '';
  const toolCallsAcc: Record<number, { name: string; args: string }> = {};
  let usage: OpenAI.CompletionUsage | undefined;
  let lastEmitMs = 0;
  const EMIT_INTERVAL_MS = 400;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) textAcc += delta.content;
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCallsAcc[idx]) toolCallsAcc[idx] = { name: '', args: '' };
        if (tc.function?.name) toolCallsAcc[idx].name += tc.function.name;
        if (tc.function?.arguments) toolCallsAcc[idx].args += tc.function.arguments;
      }
    }
    if (chunk.usage) usage = chunk.usage;

    // 2. Throttled intermediate update
    if (onCall && Date.now() - lastEmitMs >= EMIT_INTERVAL_MS) {
      onCall({
        callIndex,
        model: params.model,
        messages: normalizedMessages,
        tools: availableTools,
        responseText: textAcc,
        toolCalls: Object.values(toolCallsAcc),
        streaming: true,
      });
      lastEmitMs = Date.now();
    }

    yield chunk;
  }

  // 3. Final emit with complete data
  onCall?.({
    callIndex,
    model: params.model,
    messages: normalizedMessages,
    tools: availableTools,
    responseText: textAcc,
    toolCalls: Object.values(toolCallsAcc),
    usage: usage
      ? {
          prompt: usage.prompt_tokens ?? 0,
          completion: usage.completion_tokens ?? 0,
          total: usage.total_tokens ?? 0,
        }
      : undefined,
    streaming: false,
  });
}
