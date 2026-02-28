/**
 * In-memory store for LLM call debug info, keyed by subscriptionId.
 * Populated by pipeline.ts during background step execution.
 * Exposed via GET /api/subscriptions/[id]/llm-calls for wizard debug UI.
 *
 * Uses globalThis so the store survives Next.js dev-mode module re-evaluations
 * (different route bundles would otherwise get separate Map instances).
 */

import type { LLMCallInfo } from '@/lib/ai/client';

declare global {
  // eslint-disable-next-line no-var
  var __llmCallStore: Map<string, LLMCallInfo[]> | undefined;
}

function getStore(): Map<string, LLMCallInfo[]> {
  if (!globalThis.__llmCallStore) {
    globalThis.__llmCallStore = new Map();
  }
  return globalThis.__llmCallStore;
}

export function getLLMCalls(subscriptionId: string): LLMCallInfo[] {
  return getStore().get(subscriptionId) ?? [];
}

/** Insert or update a call (matched by sourceUrl + callIndex to avoid conflicts during parallel generation). */
export function upsertLLMCall(subscriptionId: string, info: LLMCallInfo): void {
  const store = getStore();
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
  getStore().delete(subscriptionId);
}

/** Remove all LLM calls for a specific source within a subscription. */
export function clearSourceLLMCalls(subscriptionId: string, sourceUrl: string): void {
  const store = getStore();
  const calls = store.get(subscriptionId);
  if (!calls) return;
  const filtered = calls.filter((c) => c.sourceUrl !== sourceUrl);
  if (filtered.length === 0) {
    store.delete(subscriptionId);
  } else {
    store.set(subscriptionId, filtered);
  }
}
