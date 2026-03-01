// src/lib/scheduler/retryManager.ts
// In-memory retry manager for failed collections.
// Retries up to 3 times with delays: 5s → 30s → 60s.
// State is lost on restart — startup recovery in index.ts compensates.

import { collect } from './collector';

const RETRY_DELAYS = [5_000, 30_000, 60_000]; // 5s, 30s, 1min
export const MAX_RETRIES = 3;

export interface RetryState {
  attempt: number;       // 1-3
  nextRetryAt: number;   // timestamp ms
  lastError: string;
  timerId: ReturnType<typeof setTimeout>;
}

const retryStates = new Map<string, RetryState>();

/**
 * Schedule a retry for a failed source.
 * Returns true if a retry was scheduled, false if retries exhausted.
 */
export function scheduleRetry(sourceId: string, error: string): boolean {
  const current = retryStates.get(sourceId);
  const attempt = (current?.attempt ?? 0) + 1;

  if (attempt > MAX_RETRIES) {
    retryStates.delete(sourceId);
    return false;
  }

  // Clear previous timer if any
  if (current?.timerId) clearTimeout(current.timerId);

  const delay = RETRY_DELAYS[attempt - 1];
  const nextRetryAt = Date.now() + delay;

  const timerId = setTimeout(async () => {
    console.log(`[Retry] source=${sourceId} attempt=${attempt}/${MAX_RETRIES} — executing`);
    await collect(sourceId);
    // collect() will call clearRetry on success or scheduleRetry again on failure
  }, delay);

  retryStates.set(sourceId, { attempt, nextRetryAt, lastError: error, timerId });
  console.log(`[Retry] source=${sourceId} attempt=${attempt}/${MAX_RETRIES} scheduled in ${delay / 1000}s`);
  return true;
}

/**
 * Clear retry state — called on successful collection or manual trigger.
 */
export function clearRetry(sourceId: string): void {
  const state = retryStates.get(sourceId);
  if (state) {
    clearTimeout(state.timerId);
    retryStates.delete(sourceId);
    console.log(`[Retry] source=${sourceId} cleared`);
  }
}

/**
 * Get retry state for a single source.
 */
export function getRetryState(sourceId: string): RetryState | undefined {
  return retryStates.get(sourceId);
}

/**
 * Get all retry states (for API).
 */
export function getAllRetryStates(): Map<string, RetryState> {
  return retryStates;
}
