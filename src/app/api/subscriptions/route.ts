import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, sources, messageCards, notifications } from '@/lib/db/schema';
import { hash } from '@/lib/utils/hash';
import type { CollectedItem } from '@/lib/sandbox/contract';
import { requireAuth } from '@/lib/auth';

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
    return Response.json(rows);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[subscriptions GET]', err);
    return Response.json({ error: 'Failed to load subscriptions' }, { status: 500 });
  }
}

interface SourceInput {
  title: string;
  url: string;
  description?: string;
  script: string;
  cronExpression?: string;
  isEnabled?: boolean;
  initialItems?: CollectedItem[];
}

// POST /api/subscriptions — create a new subscription
// Supports two modes:
//   Simple:  { topic, criteria }                             → creates subscription only
//   Wizard:  { topic, criteria, sources: SourceInput[] }    → creates subscription + sources + initial message cards
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const { topic, criteria, sources: sourcesInput } = body as {
      topic?: string;
      criteria?: string;
      sources?: SourceInput[];
    };

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return Response.json({ error: 'topic is required' }, { status: 400 });
    }

    const db = getDb();
    const now = new Date();

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
      let totalNewCards = 0;

      for (const srcInput of sourcesInput) {
        if (!srcInput.title || !srcInput.url) continue;

        // Insert source record
        const source = db
          .insert(sources)
          .values({
            subscriptionId: subscription.id,
            title: srcInput.title,
            description: srcInput.description || null,
            url: srcInput.url,
            script: srcInput.script,
            cronExpression: srcInput.cronExpression ?? '0 * * * *',
            isEnabled: srcInput.isEnabled !== false,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();

        // Write initial message cards from validation step
        const items = srcInput.initialItems ?? [];
        let newCards = 0;

        for (const item of items) {
          if (!item.title || !item.url) continue;
          const contentHash = hash(item.title + item.url);

          // Check criteria match (simple keyword)
          const criteriaText = criteria?.trim().toLowerCase() ?? '';
          const itemText = `${item.title} ${item.summary ?? ''}`.toLowerCase();
          const meetsCriteria = criteriaText
            ? criteriaText.split(/[\s,，、]+/).filter(Boolean).some((kw) => itemText.includes(kw))
            : false;

          try {
            db.insert(messageCards)
              .values({
                subscriptionId: subscription.id,
                sourceId: source.id,
                contentHash,
                title: item.title,
                summary: item.summary || null,
                thumbnailUrl: item.thumbnailUrl || null,
                sourceUrl: item.url,
                publishedAt: item.publishedAt ? new Date(item.publishedAt) : now,
                meetsCriteriaFlag: meetsCriteria,
                readAt: null,
                rawData: JSON.stringify(item),
                createdAt: now,
              })
              .onConflictDoNothing() // UNIQUE(content_hash, source_id)
              .run();

            newCards++;
          } catch {
            // Skip on conflict
          }
        }

        totalNewCards += newCards;

        // Update source stats to reflect the initial validation run
        db.update(sources)
          .set({
            totalRuns: 1,
            successRuns: 1,
            itemsCollected: newCards,
            lastRunAt: now,
            lastRunSuccess: true,
            updatedAt: now,
          })
          .where(eq(sources.id, source.id))
          .run();

        // 3. Write source_created notification
        db.insert(notifications)
          .values({
            type: 'source_created',
            title: `订阅源已创建：${source.title}`,
            body: `已采集到 ${newCards} 条初始内容`,
            isRead: false,
            subscriptionId: subscription.id,
            relatedEntityType: 'source',
            relatedEntityId: source.id,
            createdAt: now,
          })
          .run();

        // 4. Schedule source
        try {
          const { jobManager } = await import('@/lib/scheduler/jobManager');
          if (source.isEnabled) {
            jobManager.scheduleSource(source);
          }
        } catch {
          // Scheduler may not be initialised in API-only context
        }
      }

      // 5. Update subscription counts
      if (totalNewCards > 0) {
        db.update(subscriptions)
          .set({
            unreadCount: totalNewCards,
            totalCount: totalNewCards,
            lastUpdatedAt: now,
            updatedAt: now,
          })
          .where(eq(subscriptions.id, subscription.id))
          .run();
      }
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
