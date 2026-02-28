/**
 * In-memory store for LLM call debug info, keyed by subscriptionId.
 * Populated by pipeline.ts during background step execution.
 * Exposed via GET /api/subscriptions/[id]/llm-calls for wizard debug UI.
 */

import type { LLMCallInfo } from '@/lib/ai/client';

const store = new Map<string, LLMCallInfo[]>();

export function getLLMCalls(subscriptionId: string): LLMCallInfo[] {
  return store.get(subscriptionId) ?? [];
}

/** Insert or update a call (matched by sourceUrl + callIndex to avoid conflicts during parallel generation). */
export function upsertLLMCall(subscriptionId: string, info: LLMCallInfo): void {
  const calls = store.get(subscriptionId) ?? [];
  const idx = calls.findIndex(
    (c) => c.callIndex === info.callIndex && c.sourceUrl === info.sourceUrl
  );
  if (idx >= 0) {
    calls[idx] = info;
  } else {
    calls.push(info);
  }
  store.set(subscriptionId, calls);
}

export function clearLLMCalls(subscriptionId: string): void {
  store.delete(subscriptionId);
}
