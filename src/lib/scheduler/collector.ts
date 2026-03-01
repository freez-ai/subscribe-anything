// src/lib/scheduler/collector.ts
// Full collection pipeline:
//   1. Run script in isolated-vm sandbox
//   2. Dedup each item against message_cards (contentHash + sourceId)
//   3. Persist new items as message_cards (readAt=null → unread)
//   4. Check criteria match → meetsCriteriaFlag
//   5. Update source stats + subscription counts
//   6. On script failure: mark source.status='failed', write source_failed notification

import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sources, subscriptions, messageCards } from '@/lib/db/schema';
import { runScript } from '@/lib/sandbox/runner';
import { hash } from '@/lib/utils/hash';
import { nextCronDate } from '@/lib/utils/cron';
import { createNotification } from '@/lib/notifications';

export interface CollectResult {
  newItems: number;
  skipped: number;
  error?: string;
}

export async function collect(sourceId: string): Promise<CollectResult> {
  const db = getDb();

  // Load source + subscription
  const source = db.select().from(sources).where(eq(sources.id, sourceId)).get();
  if (!source) {
    return { newItems: 0, skipped: 0, error: `Source ${sourceId} not found` };
  }

  const subscription = db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, source.subscriptionId))
    .get();

  const now = new Date();

  // ── Run script ───────────────────────────────────────────────────────────────
  let runResult: Awaited<ReturnType<typeof runScript>>;
  try {
    runResult = await runScript(source.script);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    _markFailed(db, source, subscription, errorMsg, now);
    return { newItems: 0, skipped: 0, error: errorMsg };
  }

  if (!runResult.success) {
    _markFailed(db, source, subscription, runResult.error ?? 'Script error', now);
    return { newItems: 0, skipped: 0, error: runResult.error };
  }

  const items = runResult.items ?? [];

  // ── Zero items = script broken (returns nothing useful) ─────────────────────
  if (items.length === 0) {
    const errorMsg = '脚本执行成功但未返回任何数据，请检查脚本逻辑或目标页面是否变更';
    _markFailed(db, source, subscription, errorMsg, now);
    return { newItems: 0, skipped: 0, error: errorMsg };
  }

  // ── Dedup + persist ───────────────────────────────────────────────────────────
  let newItems = 0;
  let skipped = 0;
  const criteriaText = subscription?.criteria?.trim().toLowerCase() ?? '';

  for (const item of items) {
    if (!item.title || !item.url) continue;

    const contentHash = hash(item.title + item.url);

    // Check existence (UNIQUE index will also protect, but pre-check avoids noise)
    const existing = db
      .select({ id: messageCards.id })
      .from(messageCards)
      .where(
        and(
          eq(messageCards.contentHash, contentHash),
          eq(messageCards.sourceId, sourceId)
        )
      )
      .get();

    if (existing) {
      skipped++;
      continue;
    }

    // Criteria match — prefer script-provided criteriaResult; fall back to keyword matching
    let meetsCriteria: boolean;
    if (item.criteriaResult !== undefined) {
      meetsCriteria = item.criteriaResult === 'matched';
    } else if (criteriaText) {
      const itemText = `${item.title} ${item.summary ?? ''}`.toLowerCase();
      meetsCriteria = criteriaText.split(/[\s,，、]+/).filter(Boolean).some((kw) => itemText.includes(kw));
    } else {
      meetsCriteria = false;
    }

    try {
      db.insert(messageCards)
        .values({
          subscriptionId: source.subscriptionId,
          sourceId,
          contentHash,
          title: item.title,
          summary: item.summary ?? null,
          thumbnailUrl: item.thumbnailUrl ?? null,
          sourceUrl: item.url,
          publishedAt: item.publishedAt ? new Date(item.publishedAt) : now,
          meetsCriteriaFlag: meetsCriteria,
          criteriaResult: item.criteriaResult ?? null,
          metricValue: item.metricValue ?? null,
          readAt: null,
          rawData: JSON.stringify(item),
          createdAt: now,
        })
        .onConflictDoNothing()
        .run();

      newItems++;
    } catch {
      skipped++;
    }
  }

  // ── Update source stats ───────────────────────────────────────────────────────
  const nextRun = nextCronDate(source.cronExpression);
  db.update(sources)
    .set({
      lastRunAt: now,
      lastRunSuccess: true,
      lastError: null,
      nextRunAt: nextRun,
      totalRuns: sql`${sources.totalRuns} + 1`,
      successRuns: sql`${sources.successRuns} + 1`,
      itemsCollected: sql`${sources.itemsCollected} + ${newItems}`,
      status: 'active', // reset from 'failed' if it was previously broken
      updatedAt: now,
    })
    .where(eq(sources.id, sourceId))
    .run();

  // ── Update subscription counts ────────────────────────────────────────────────
  if (newItems > 0 && subscription) {
    db.update(subscriptions)
      .set({
        unreadCount: sql`${subscriptions.unreadCount} + ${newItems}`,
        totalCount: sql`${subscriptions.totalCount} + ${newItems}`,
        lastUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, source.subscriptionId))
      .run();

    createNotification(db, {
      type: 'cards_collected',
      title: `新增 ${newItems} 条消息卡片`,
      body: source.title,
      subscriptionId: subscription.id,
      relatedEntityType: 'source',
      relatedEntityId: source.id,
    });
  }

  console.log(`[Collector] source=${sourceId} new=${newItems} skipped=${skipped}`);
  return { newItems, skipped };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _markFailed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: ReturnType<typeof getDb>,
  source: { id: string; subscriptionId: string; title: string; cronExpression: string },
  subscription: { id: string } | undefined,
  errorMsg: string,
  now: Date
) {
  const nextRun = nextCronDate(source.cronExpression);

  db.update(sources)
    .set({
      lastRunAt: now,
      lastRunSuccess: false,
      lastError: errorMsg,
      nextRunAt: nextRun,
      totalRuns: sql`${sources.totalRuns} + 1`,
      status: 'failed',
      updatedAt: now,
    })
    .where(eq(sources.id, source.id))
    .run();

  if (subscription) {
    createNotification(db, {
      type: 'source_failed',
      title: `订阅源采集失败：${source.title}`,
      body: errorMsg.slice(0, 500),
      subscriptionId: subscription.id,
      relatedEntityType: 'source',
      relatedEntityId: source.id,
    });
  }

  console.error(`[Collector] source=${source.id} FAILED: ${errorMsg}`);
}
