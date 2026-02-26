// src/lib/scheduler/index.ts
// Called once from server.ts on startup.
// Loads all enabled, non-pending sources and registers their cron jobs.

import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sources } from '@/lib/db/schema';
import { scheduleSource, getScheduledCount } from './jobManager';

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
}
