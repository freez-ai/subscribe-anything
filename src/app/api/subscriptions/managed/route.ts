import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import { runManagedPipeline } from '@/lib/managed/pipeline';
import type { ManagedStartStep } from '@/lib/managed/pipeline';
import type { FoundSource, GeneratedSource } from '@/types/wizard';

// POST /api/subscriptions/managed
// Creates a placeholder subscription and starts the managed pipeline in the background.
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const {
      topic,
      criteria,
      startStep = 'find_sources',
      foundSources,
      generatedSources,
    } = body as {
      topic?: string;
      criteria?: string;
      startStep?: ManagedStartStep;
      foundSources?: FoundSource[];
      generatedSources?: GeneratedSource[];
    };

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return Response.json({ error: 'topic is required' }, { status: 400 });
    }

    const db = getDb();
    const now = new Date();

    // Create placeholder subscription
    const subscription = db
      .insert(subscriptions)
      .values({
        userId: session.userId,
        topic: topic.trim(),
        criteria: criteria?.trim() || null,
        isEnabled: false,
        managedStatus: 'managed_creating',
        unreadCount: 0,
        totalCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Fire-and-forget managed pipeline
    runManagedPipeline(subscription.id, {
      topic: topic.trim(),
      criteria: criteria?.trim(),
      startStep,
      userId: session.userId,
      foundSources,
      generatedSources,
    }).catch((err) => console.error('[managed POST] Pipeline error:', err));

    return Response.json({ id: subscription.id }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[subscriptions/managed POST]', err);
    return Response.json({ error: 'Failed to start managed creation' }, { status: 500 });
  }
}
