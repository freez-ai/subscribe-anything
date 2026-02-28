import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import { createSourcesForSubscription } from '@/lib/subscriptionCreator';
import type { SourceInput } from '@/lib/subscriptionCreator';

// POST /api/subscriptions/[id]/complete-wizard
// Called from Step4 when the subscription was created in bare mode (manual_creating).
// Creates sources + message cards, then marks subscription as active.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    const existing = db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.userId)))
      .get();

    if (!existing) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    if (existing.managedStatus !== 'manual_creating') {
      return Response.json({ error: 'Subscription is not in manual_creating state' }, { status: 400 });
    }

    const body = await req.json();
    const { sources: sourcesInput, criteria } = body as {
      sources?: SourceInput[];
      criteria?: string;
    };

    if (!Array.isArray(sourcesInput) || sourcesInput.length === 0) {
      return Response.json({ error: 'sources is required' }, { status: 400 });
    }

    // Create sources and message cards
    await createSourcesForSubscription(id, sourcesInput, criteria ?? existing.criteria ?? undefined);

    // Mark subscription as active
    const now = new Date();
    db.update(subscriptions)
      .set({
        managedStatus: null,
        managedError: null,
        wizardStateJson: null,
        isEnabled: true,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, id))
      .run();

    return Response.json({ id });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[complete-wizard POST]', err);
    return Response.json({ error: 'Failed to complete wizard' }, { status: 500 });
  }
}
