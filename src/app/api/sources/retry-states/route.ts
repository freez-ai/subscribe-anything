import { getAllRetryStates, getCollectingSet, MAX_RETRIES } from '@/lib/scheduler/retryManager';

// GET /api/sources/retry-states?ids=id1,id2,...
export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids');

  const allStates = getAllRetryStates();
  const collecting = getCollectingSet();
  const result: Record<string, {
    attempt: number; maxAttempts: number; nextRetryAt: number; lastError: string;
    collecting?: boolean;
  }> = {};

  const ids = idsParam ? idsParam.split(',').filter(Boolean) : undefined;

  // Build retry entries
  if (ids) {
    for (const id of ids) {
      const state = allStates.get(id);
      if (state) {
        result[id] = {
          attempt: state.attempt,
          maxAttempts: MAX_RETRIES,
          nextRetryAt: state.nextRetryAt,
          lastError: state.lastError,
        };
      }
    }
  } else {
    for (const [id, state] of allStates) {
      result[id] = {
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
    if (collecting.has(id) && !result[id]) {
      result[id] = {
        attempt: 0,
        maxAttempts: MAX_RETRIES,
        nextRetryAt: 0,
        lastError: '',
        collecting: true,
      };
    }
    if (result[id] && collecting.has(id)) {
      result[id].collecting = true;
    }
  }

  return Response.json(result);
}
