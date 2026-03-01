import { getAllRetryStates, getCollectingSet, getAllLastResults, MAX_RETRIES } from '@/lib/scheduler/retryManager';

// GET /api/sources/retry-states?ids=id1,id2,...
export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids');

  const allStates = getAllRetryStates();
  const collecting = getCollectingSet();
  const allResults = getAllLastResults();
  const states: Record<string, {
    attempt: number; maxAttempts: number; nextRetryAt: number; lastError: string;
    collecting?: boolean;
  }> = {};
  const results: Record<string, { newItems: number; skipped: number; error?: string; success: boolean }> = {};

  const ids = idsParam ? idsParam.split(',').filter(Boolean) : undefined;

  // Build retry entries
  if (ids) {
    for (const id of ids) {
      const state = allStates.get(id);
      if (state) {
        states[id] = {
          attempt: state.attempt,
          maxAttempts: MAX_RETRIES,
          nextRetryAt: state.nextRetryAt,
          lastError: state.lastError,
        };
      }
    }
  } else {
    for (const [id, state] of allStates) {
      states[id] = {
        attempt: state.attempt,
        maxAttempts: MAX_RETRIES,
        nextRetryAt: state.nextRetryAt,
        lastError: state.lastError,
      };
    }
  }

  // Add collecting-only entries (no retry state yet, first attempt)
  const targetIds = ids ?? [...collecting];
  for (const id of targetIds) {
    if (collecting.has(id) && !states[id]) {
      states[id] = {
        attempt: 0,
        maxAttempts: MAX_RETRIES,
        nextRetryAt: 0,
        lastError: '',
        collecting: true,
      };
    }
    if (states[id] && collecting.has(id)) {
      states[id].collecting = true;
    }
  }

  // Build last results
  const resultIds = ids ?? [...allResults.keys()];
  for (const id of resultIds) {
    const r = allResults.get(id);
    if (r) {
      results[id] = { newItems: r.newItems, skipped: r.skipped, error: r.error, success: r.success };
    }
  }

  return Response.json({ states, results });
}
