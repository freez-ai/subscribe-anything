import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, managedBuildLogs } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import { createSourcesForSubscription } from '@/lib/subscriptionCreator';
import type { SourceInput } from '@/lib/subscriptionCreator';

// GET /api/subscriptions — list all subscriptions ordered by createdAt DESC
export async function GET() {
  try {
    const session = await requireAuth();
    const db = getDb();
    const rows = db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.userId))
      .orderBy(desc(subscriptions.createdAt))
      .all();

    // For creating subscriptions, attach the latest log message
    const creatingIds = rows
      .filter((s) => s.managedStatus === 'manual_creating' || s.managedStatus === 'managed_creating')
      .map((s) => s.id);

    const latestLogs: Record<string, string> = {};
    for (const subId of creatingIds) {
      const latest = db
        .select({ message: managedBuildLogs.message })
        .from(managedBuildLogs)
        .where(eq(managedBuildLogs.subscriptionId, subId))
        .orderBy(desc(managedBuildLogs.createdAt))
        .limit(1)
        .get();
      if (latest) latestLogs[subId] = latest.message;
    }

    return Response.json(
      rows.map((r) => ({ ...r, latestLog: latestLogs[r.id] ?? null }))
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[subscriptions GET]', err);
    return Response.json({ error: 'Failed to load subscriptions' }, { status: 500 });
  }
}

// POST /api/subscriptions — create a new subscription
// Supports three modes:
//   Bare:    { topic, criteria, bare: true }              → creates placeholder subscription (manual_creating)
//   Simple:  { topic, criteria }                          → creates subscription only
//   Wizard:  { topic, criteria, sources: SourceInput[] }  → creates subscription + sources + initial message cards
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const { topic, criteria, sources: sourcesInput, bare } = body as {
      topic?: string;
      criteria?: string;
      sources?: SourceInput[];
      bare?: boolean;
    };

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return Response.json({ error: 'topic is required' }, { status: 400 });
    }

    const db = getDb();
    const now = new Date();

    // Bare mode: create placeholder subscription for wizard persistence
    if (bare === true) {
      const subscription = db
        .insert(subscriptions)
        .values({
          userId: session.userId,
          topic: topic.trim(),
          criteria: criteria?.trim() || null,
          isEnabled: false,
          managedStatus: 'manual_creating',
          unreadCount: 0,
          totalCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      return Response.json({ id: subscription.id }, { status: 201 });
    }

    // 1. Create subscription
    const subscription = db
      .insert(subscriptions)
      .values({
        userId: session.userId,
        topic: topic.trim(),
        criteria: criteria?.trim() || null,
        isEnabled: true,
        unreadCount: 0,
        totalCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // 2. If wizard mode: create sources + initial message cards
    if (Array.isArray(sourcesInput) && sourcesInput.length > 0) {
      await createSourcesForSubscription(subscription.id, sourcesInput, criteria);
    }

    // Re-fetch to return final state
    const final = db.select().from(subscriptions).where(eq(subscriptions.id, subscription.id)).get();

    return Response.json(final, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[subscriptions POST]', err);
    return Response.json({ error: 'Failed to create subscription' }, { status: 500 });
  }
}
