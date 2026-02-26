// src/lib/scheduler/jobManager.ts
// Manages node-cron scheduled tasks for all enabled sources.
// Uses p-limit to cap concurrent sandbox executions at 5.
// Phase 2: scheduleSource only logs; real collection wired in Phase 4.

import cron, { type ScheduledTask } from 'node-cron';
import pLimit from 'p-limit';
import type { InferSelectModel } from 'drizzle-orm';
import type { sources } from '@/lib/db/schema';

type Source = InferSelectModel<typeof sources>;

// At most 5 sandbox isolates running concurrently across all cron-triggered jobs.
// Manual /trigger calls bypass this limit (see collector.ts).
const limit = pLimit(5);

const jobs = new Map<string, ScheduledTask>();

/**
 * Register (or replace) a cron job for a source.
 * In Phase 2 the callback only logs; in Phase 4 it will call collector.ts.
 */
export function scheduleSource(source: Source): void {
  // Remove existing job for this source before registering a new one
  unscheduleSource(source.id);

  if (!source.isEnabled || source.status === 'disabled') {
    return;
  }

  if (!cron.validate(source.cronExpression)) {
    console.warn(`[Scheduler] Invalid cron expression for source ${source.id}: ${source.cronExpression}`);
    return;
  }

  const task = cron.schedule(source.cronExpression, () => {
    limit(async () => {
      console.log(`[Scheduler] Running collection for source ${source.id} (${source.title})`);
      try {
        // Phase 4: replace with real collection
        const { collect } = await import('./collector');
        await collect(source.id);
      } catch (err) {
        console.error(`[Scheduler] Collection error for source ${source.id}:`, err);
      }
    });
  });

  jobs.set(source.id, task);
  console.log(`[Scheduler] Scheduled source ${source.id} with cron ${source.cronExpression}`);
}

/** Stop and remove the cron job for a source. */
export function unscheduleSource(sourceId: string): void {
  const task = jobs.get(sourceId);
  if (task) {
    task.stop();
    jobs.delete(sourceId);
    console.log(`[Scheduler] Unscheduled source ${sourceId}`);
  }
}

/** Reload a source by re-reading it from the DB and re-registering its cron job. */
export async function reloadSource(sourceId: string): Promise<void> {
  const { getDb } = await import('@/lib/db');
  const { sources } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const db = getDb();
  const source = db.select().from(sources).where(eq(sources.id, sourceId)).get();

  if (!source) {
    unscheduleSource(sourceId);
    return;
  }

  if (!source.isEnabled) {
    unscheduleSource(sourceId);
    return;
  }

  scheduleSource(source);
}

/** Expose the job map size for diagnostics. */
export function getScheduledCount(): number {
  return jobs.size;
}

// Export as a named object so API routes can import { jobManager }
export const jobManager = {
  scheduleSource,
  unscheduleSource,
  reloadSource,
  getScheduledCount,
};
