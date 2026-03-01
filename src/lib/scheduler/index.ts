// src/lib/scheduler/index.ts
// Called once from server.ts on startup.
// Loads all enabled, non-pending sources and registers their cron jobs.
// Also recovers sources that failed in a previous run.

import { and, eq, ne, lt } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sources } from '@/lib/db/schema';
import { scheduleSource, getScheduledCount } from './jobManager';
import { collect } from './collector';

export async function initScheduler(): Promise<void> {
  const db = getDb();

  // Load all sources that are enabled and not in 'pending' state.
  // 'pending' sources haven't had their script generated yet, so skip them.
  const enabledSources = db
    .select()
    .from(sources)
    .where(and(eq(sources.isEnabled, true), ne(sources.status, 'pending')))
    .all();

  for (const source of enabledSources) {
    try {
      scheduleSource(source);
    } catch (err) {
      console.error(`[Scheduler] Failed to schedule source ${source.id}:`, err);
    }
  }

  console.log(`[Scheduler] Loaded ${getScheduledCount()} sources`);

  // ── Startup recovery ────────────────────────────────────────────────────────
  // Re-run sources that failed last time and whose nextRunAt has passed.
  const now = new Date();
  const failedSources = enabledSources.filter(
    (s) =>
      s.lastRunSuccess === false &&
      s.nextRunAt &&
      new Date(s.nextRunAt) < now &&
      s.status !== 'disabled'
  );

  if (failedSources.length > 0) {
    console.log(`[Scheduler] Recovering ${failedSources.length} previously failed source(s)`);
    for (const source of failedSources) {
      // Fire and forget — collect will enter retry chain if it fails again
      collect(source.id).catch((err) =>
        console.error(`[Scheduler] Recovery collect failed for ${source.id}:`, err)
      );
    }
  }
}
