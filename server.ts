// server.ts — Custom Next.js server
// Startup order: runMigrations → initScheduler → createServer
//
// Run dev:   tsx server.ts
// Run prod:  node dist/server.js  (after tsc -p tsconfig.server.json)

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import path from 'path';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT ?? '3000', 10);

// DB_URL must be set before any DB imports so the path is correct in all contexts
if (!process.env.DB_URL) {
  process.env.DB_URL = path.join(process.cwd(), 'data', 'subscribe-anything.db');
}

async function main() {
  // 1. Run DB migrations + seed prompt templates + enable WAL
  const { runMigrations } = await import('./src/lib/db/migrate');
  await runMigrations();

  // 2. Init scheduler — load all enabled sources and register cron jobs
  const { initScheduler } = await import('./src/lib/scheduler');
  await initScheduler();

  // 3. Start Next.js
  const app = next({ dev, hostname: 'localhost', port });
  const handle = app.getRequestHandler();

  await app.prepare();

  createServer((req, res) => {
    const parsedUrl = parse(req.url ?? '/', true);
    handle(req, res, parsedUrl);
  }).listen(port, '0.0.0.0', () => {
    console.log(`[Server] Ready on http://localhost:${port} (${dev ? 'dev' : 'prod'})`);
  });
}

main().catch((err) => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});
