# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (tsx server.ts — runs migrations + scheduler + Next.js)
npm run build        # Production build: next build + tsc -p tsconfig.server.json + tsc-alias
npm run start        # Start production server from dist/server.js
npm run db:push      # Push schema changes directly to DB (dev only, no migration files)
npm run db:generate  # Generate Drizzle migration SQL files from schema changes
npm run db:migrate   # Run pending Drizzle migrations
```

No test suite is present in this project.

## Architecture

Everything runs in a single Node.js process. **`server.ts`** is the entrypoint — it runs in this order:
1. `runMigrations()` — applies Drizzle migrations, enables SQLite WAL mode, seeds prompt templates
2. `initScheduler()` — registers `node-cron` jobs for all enabled sources (max 5 concurrent via `p-limit`)
3. Next.js HTTP handler — serves the app on `localhost:3000`

### Key subsystems

**Database** (`src/lib/db/`)
- `schema.ts` — 7 Drizzle/SQLite tables: `llm_providers`, `prompt_templates`, `search_provider_config`, `subscriptions`, `sources`, `message_cards`, `notifications`, `rss_instances`
- `getDb()` returns a singleton `better-sqlite3` connection; all queries are synchronous
- DB path: `./data/subscribe-anything.db` (overridden by `DB_URL` env var)

**Script Sandbox** (`src/lib/sandbox/`)
- `runner.ts` — executes user collection scripts in `isolated-vm` (V8 Isolate, 64 MB, 30 s timeout, max 5 HTTP requests)
- `safety.ts` — static pattern check before entering the isolate (blocks `require`, `import from`, `process.`, `eval`, etc.)
- `contract.ts` — `CollectedItem` interface: scripts must define `async function collect(): Promise<CollectedItem[]>`
- The runner normalizes ES module export syntax (`export default`, `export const`) → plain declarations before sandboxing
- Scripts receive proxied `fetch`, `URL`, and `URLSearchParams` globals; no Node.js APIs

**Scheduler** (`src/lib/scheduler/`)
- `jobManager.ts` — wraps `node-cron` with `p-limit(5)`; methods: `registerJob`, `unregisterJob`, `rescheduleJob`
- `collector.ts` — full collection pipeline: run script → deduplicate via SHA-256(title+url) → insert `message_cards` → keyword/LLM criteria match → update source stats

**AI Agents** (`src/lib/ai/agents/`)
- All agents use the OpenAI SDK against whatever provider is configured in the DB (any OpenAI-compatible endpoint)
- `client.ts` — `getProviderForTemplate(templateId)` resolves the right LLM; `llmStream()` is a drop-in for `openai.chat.completions.create({ stream: true })` that also fires `onCall` callbacks for the debug UI
- Agents stream progress via SSE using `sseStream()` from `src/lib/utils/streamResponse.ts`
- `findSourcesAgent` — uses `webSearch` tool (Tavily/Serper) to find 5–10 data sources for a topic
- `generateScriptAgent` — agentic loop (max 12 iterations): webFetch/webFetchBrowser → write script → `validateScript` tool (sandbox) → `validateScriptAgent` (LLM quality check); up to 3 validate retries
- `repairScriptAgent` — same tools as generateScriptAgent, called from the source repair endpoint
- `analyzeAgent` — pure text generation, no tools; streams HTML report content

**Prompt Templates**
- Stored in the DB (`prompt_templates` table); editable via Settings UI with reset-to-default support
- Template IDs: `find-sources`, `generate-script`, `validate-script`, `repair-script`, `analyze-subscription`
- Each template can be pinned to a specific LLM provider; otherwise falls back to the globally active provider

**SSE Streaming Pattern**
- API routes that stream AI responses use `sseStream(async (emit) => { ... })` from `src/lib/utils/streamResponse.ts`
- Events are plain JSON objects serialized as `data: {...}\n\n`
- The debug UI receives `LLMCallInfo` events via the `onCall` callback wired through every agent

### Frontend

- Next.js 15 App Router, React 19, Tailwind CSS, shadcn/ui components
- Mobile-first: bottom tab bar (`BottomNav`), iOS safe area hooks (`useSafeArea`), swipe gesture support
- Unread badge polls `/api/message-cards/unread-count` every 30 seconds (`useUnreadCount` hook)
- Wizard flow (`/subscriptions/new`): 5 steps — Step1Topic → find-sources SSE → source selection → generate-scripts SSE → Step5Preview → confirm

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `DB_URL` | `./data/subscribe-anything.db` | SQLite file path |
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Controls Next.js dev/prod mode |

All LLM API keys, search provider keys, and RssHub URLs are stored in the database — no `.env` file required.

## Native Module Notes

`isolated-vm` and `better-sqlite3` are native Node.js addons compiled at `npm install`.
- **Windows**: Requires Node.js 22 LTS. After switching Node versions: `npm rebuild isolated-vm && npm rebuild better-sqlite3`
- **Docker**: Uses `node:22-bookworm-slim` (Debian) — Alpine/musl is incompatible with `isolated-vm` and Playwright
- **Linux**: Requires `python3 make g++` build tools
