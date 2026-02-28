import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, managedBuildLogs } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// GET /api/subscriptions/[id]/stream-progress
// SSE endpoint: streams managed_build_logs in real-time by polling the DB.
// Sends: { type: 'log', id, step, level, message, payload, createdAt }
//        { type: 'done', reason: 'complete' | 'deleted' }
// Closes when: subscription deleted, managedStatus becomes null (complete), or client disconnects.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    const sub = db
      .select({ managedStatus: subscriptions.managedStatus })
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.userId)))
      .get();

    if (!sub) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // stream already closed — ignore
          }
        };

        const seenIds = new Set<string>();
        let closed = false;

        const close = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        };

        const sendNewLogs = () => {
          if (closed) return null;
          const logs = db
            .select()
            .from(managedBuildLogs)
            .where(eq(managedBuildLogs.subscriptionId, id))
            .orderBy(asc(managedBuildLogs.createdAt))
            .all();

          for (const log of logs) {
            if (!seenIds.has(log.id)) {
              seenIds.add(log.id);
              send({
                type: 'log',
                id: log.id,
                step: log.step,
                level: log.level,
                message: log.message,
                payload: log.payload ? JSON.parse(log.payload) : null,
                createdAt: log.createdAt,
              });
            }
          }

          // Check subscription status
          const current = db
            .select({ managedStatus: subscriptions.managedStatus })
            .from(subscriptions)
            .where(eq(subscriptions.id, id))
            .get();

          return current;
        };

        // Send all existing logs immediately
        const initial = sendNewLogs();
        if (!initial) {
          send({ type: 'done', reason: 'deleted' });
          close();
          return;
        }
        if (initial.managedStatus === null) {
          send({ type: 'done', reason: 'complete' });
          close();
          return;
        }

        // Poll for new logs every 800ms
        const interval = setInterval(() => {
          if (closed) {
            clearInterval(interval);
            return;
          }
          const current = sendNewLogs();
          if (!current) {
            send({ type: 'done', reason: 'deleted' });
            clearInterval(interval);
            close();
          } else if (current.managedStatus === null) {
            send({ type: 'done', reason: 'complete' });
            clearInterval(interval);
            close();
          }
        }, 800);

        // Safety: close after 30 minutes
        const timeout = setTimeout(() => {
          clearInterval(interval);
          close();
        }, 30 * 60 * 1000);

        // Handle client disconnect
        req.signal.addEventListener('abort', () => {
          clearInterval(interval);
          clearTimeout(timeout);
          close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[stream-progress GET]', err);
    return Response.json({ error: 'Failed to stream progress' }, { status: 500 });
  }
}
