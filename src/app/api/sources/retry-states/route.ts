import { getAllRetryStates, MAX_RETRIES } from '@/lib/scheduler/retryManager';

// GET /api/sources/retry-states?ids=id1,id2,...
export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids');

  const allStates = getAllRetryStates();
  const result: Record<string, { attempt: number; maxAttempts: number; nextRetryAt: number; lastError: string }> = {};

  if (idsParam) {
    const ids = idsParam.split(',').filter(Boolean);
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

  return Response.json(result);
}
