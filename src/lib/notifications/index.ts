import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { notifications } from '@/lib/db/schema';

interface NotificationPayload {
  type: 'source_created' | 'source_fixed' | 'source_failed';
  title: string;
  body?: string;
  subscriptionId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createNotification(db: BetterSQLite3Database<any>, payload: NotificationPayload): void {
  try {
    db.insert(notifications)
      .values({
        type: payload.type,
        title: payload.title,
        body: payload.body ?? null,
        isRead: false,
        subscriptionId: payload.subscriptionId ?? null,
        relatedEntityType: payload.relatedEntityType ?? null,
        relatedEntityId: payload.relatedEntityId ?? null,
        createdAt: new Date(),
      })
      .run();
  } catch (err) {
    console.error('[Notifications] Failed to create notification:', err);
  }
}
