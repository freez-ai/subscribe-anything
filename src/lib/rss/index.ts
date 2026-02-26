import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { rssInstances } from '@/lib/db/schema';

/**
 * Returns the base URL of the currently active RSS instance (e.g. "https://freezrss.zeabur.app").
 * Trailing slash is stripped.
 * Throws a clear error if no active instance is configured.
 */
export function getActiveRssBaseUrl(): string {
  const db = getDb();
  const instance = db
    .select({ baseUrl: rssInstances.baseUrl })
    .from(rssInstances)
    .where(eq(rssInstances.isActive, true))
    .get();

  if (!instance) {
    throw new Error('No active RSS instance configured. Please add one in Settings → RSS 实例.');
  }

  return instance.baseUrl.replace(/\/+$/, '');
}
