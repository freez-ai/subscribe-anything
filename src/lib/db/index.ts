import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const DB_PATH = process.env.DB_URL ?? 'data/subscribe-anything.db';

// Persist across Next.js HMR reloads in dev mode
declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof createDb> | undefined;
}

function createDb() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

export function getDb() {
  if (!global.__db) {
    global.__db = createDb();
  }
  return global.__db;
}

export type Db = ReturnType<typeof getDb>;
