import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, sources } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// Helper to handle auth errors
function handleAuthError(err: unknown): Response | null {
  if (err instanceof Error && err.message === 'UNAUTHORIZED') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

// GET /api/subscriptions/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();
    const row = db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.userId)))
      .get();
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(row);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[subscriptions/[id] GET]', err);
    return Response.json({ error: 'Failed to load subscription' }, { status: 500 });
  }
}

// PATCH /api/subscriptions/[id] — update topic, criteria, isEnabled
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    const existing = db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.userId)))
      .get();
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    const body = await req.json();
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.topic === 'string') patch.topic = body.topic.trim();
    if (typeof body.criteria === 'string') patch.criteria = body.criteria.trim() || null;
    if (typeof body.isEnabled === 'boolean') patch.isEnabled = body.isEnabled;
    // Allow wizardStateJson update when in manual_creating state
    if (typeof body.wizardStateJson === 'string' && existing.managedStatus === 'manual_creating') {
      patch.wizardStateJson = body.wizardStateJson;
    }

    db.update(subscriptions).set(patch).where(eq(subscriptions.id, id)).run();

    // If disabling/enabling subscription, schedule/unschedule sources
    if (typeof body.isEnabled === 'boolean') {
      const allSources = db
        .select()
        .from(sources)
        .where(eq(sources.subscriptionId, id))
        .all();

      try {
        // Import dynamically to avoid circular dep issues in Next.js API routes
        const { jobManager } = await import('@/lib/scheduler/jobManager');
        if (!body.isEnabled) {
          for (const src of allSources) {
            jobManager.unscheduleSource(src.id);
          }
        } else {
          for (const src of allSources) {
            if (src.isEnabled && src.status === 'active') {
              jobManager.scheduleSource(src);
            }
          }
        }
      } catch {
        // Scheduler may not be initialised in API-only context (e.g. tests)
      }
    }

    const updated = db.select().from(subscriptions).where(eq(subscriptions.id, id)).get();
    return Response.json(updated);
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[subscriptions/[id] PATCH]', err);
    return Response.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}

// DELETE /api/subscriptions/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    const existing = db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.userId)))
      .get();
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });

    // Unschedule all sources before deleting
    const allSources = db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.subscriptionId, id))
      .all();

    try {
      const { jobManager } = await import('@/lib/scheduler/jobManager');
      for (const src of allSources) {
        jobManager.unscheduleSource(src.id);
      }
    } catch {
      // Scheduler may not be initialised in API-only context
    }

    db.delete(subscriptions).where(eq(subscriptions.id, id)).run();
    return new Response(null, { status: 204 });
  } catch (err) {
    const authError = handleAuthError(err);
    if (authError) return authError;
    console.error('[subscriptions/[id] DELETE]', err);
    return Response.json({ error: 'Failed to delete subscription' }, { status: 500 });
  }
}
