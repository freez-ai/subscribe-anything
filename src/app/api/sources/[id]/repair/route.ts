import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sources, subscriptions } from '@/lib/db/schema';
import { sseStream } from '@/lib/utils/streamResponse';
import { requireAuth } from '@/lib/auth';
import { startRepair, isRepairing, getRepairTask } from '@/lib/repair/manager';
import type { RepairMessage } from '@/lib/repair/manager';

// POST /api/sources/[id]/repair — fire-and-forget: start background repair
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    const result = db.select()
      .from(sources)
      .innerJoin(subscriptions, eq(sources.subscriptionId, subscriptions.id))
      .where(and(eq(sources.id, id), eq(subscriptions.userId, session.userId)))
      .get();

    if (!result) {
      return Response.json({ error: 'Source not found' }, { status: 404 });
    }

    if (isRepairing(id)) {
      return Response.json({ ok: true, alreadyRunning: true });
    }

    const source = result.sources;
    startRepair(id, {
      title: source.title,
      url: source.url,
      script: source.script,
      lastError: source.lastError,
      subscriptionId: source.subscriptionId,
    }, session.userId);

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[sources/[id]/repair POST]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/sources/[id]/repair — SSE stream: subscribe to repair progress
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const task = getRepairTask(id);
    if (!task) {
      return Response.json({ error: 'No repair task found' }, { status: 404 });
    }

    return sseStream(async (emit) => {
      // Replay existing messages
      for (const msg of task.messages) {
        emit(msg);
      }

      // If already finished, we're done
      if (task.status !== 'running') return;

      // Subscribe to live updates until 'done'
      await new Promise<void>((resolve) => {
        const listener = (msg: RepairMessage) => {
          emit(msg);
          if (msg.type === 'done') {
            task.listeners.delete(listener);
            resolve();
          }
        };
        task.listeners.add(listener);
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[sources/[id]/repair GET]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
