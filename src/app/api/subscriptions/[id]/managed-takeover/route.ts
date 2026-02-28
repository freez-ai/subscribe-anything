import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import type { FoundSource } from '@/types/wizard';

// POST /api/subscriptions/[id]/managed-takeover
// Stops the managed pipeline (by switching status to manual_creating),
// reads the current wizard state from wizardStateJson, and returns it
// for the frontend to resume seamlessly in the wizard.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    const sub = db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.userId)))
      .get();

    if (!sub) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // If not in managed_creating or failed, return alreadyDone so frontend can handle gracefully
    if (sub.managedStatus !== 'managed_creating' && sub.managedStatus !== 'failed') {
      return Response.json({ alreadyDone: true, managedStatus: sub.managedStatus });
    }

    // Read wizard state directly from wizardStateJson (persisted by pipeline)
    const wizardState = sub.wizardStateJson ? JSON.parse(sub.wizardStateJson) : null;

    let foundSources: FoundSource[] = [];
    let generatedSources = [];
    let selectedIndices: number[] = [];
    let resumeStep: 2 | 3 = 2;

    if (wizardState && wizardState.step) {
      foundSources = wizardState.foundSources ?? [];
      generatedSources = wizardState.generatedSources ?? [];
      selectedIndices = wizardState.selectedIndices ?? foundSources.map((_: unknown, i: number) => i);
      // If pipeline reached step 3+ (sources found), resume at step 3
      resumeStep = wizardState.step >= 3 ? 3 : 2;
    }
    // If wizardState is null or has no step, pipeline just started —
    // return step 2 with empty data; Step2 will connect to SSE and wait.

    // Build wizard state to persist
    const newWizardState = {
      step: resumeStep,
      topic: sub.topic,
      criteria: sub.criteria ?? '',
      foundSources,
      selectedIndices,
      generatedSources,
      subscriptionId: id,
      managedError: sub.managedError ?? null,
    };

    // Switch status to manual_creating
    db.update(subscriptions)
      .set({
        managedStatus: 'manual_creating',
        wizardStateJson: JSON.stringify(newWizardState),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, id))
      .run();

    return Response.json({
      id,
      topic: sub.topic,
      criteria: sub.criteria ?? '',
      foundSources,
      selectedIndices,
      generatedSources,
      resumeStep,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[managed-takeover POST]', err);
    return Response.json({ error: 'Failed to takeover managed creation' }, { status: 500 });
  }
}
