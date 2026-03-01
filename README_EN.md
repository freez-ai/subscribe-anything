<div align="center">

<img src="public/android-chrome-512x512.png" width="120" alt="Subscribe Anything Logo" />

# Subscribe Anything · 订阅万物

**AI-powered intelligent data subscription platform**

[中文文档](README.md)

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-WAL-green?logo=sqlite)](https://sqlite.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](https://docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![screenshot](docs/screenshot.png)

</div>

---

## What is Subscribe Anything?

Subscribe Anything is a self-hosted platform that lets you subscribe to *any* topic — people, products, technologies, events — and get notified when new content matching your criteria appears. Instead of manually configuring RSS feeds or writing scraping scripts yourself, an AI agent does it all:

1. **Describe a topic** (e.g. "OpenAI research papers") and an optional monitoring criterion (e.g. "cited more than 100 times")
2. **The AI finds 5–10 data sources** for your topic using a web search, preferring RSS/API feeds when available — then select which sources to subscribe to
3. **The AI writes a JavaScript collection script** for each source, validates it in a sandbox, and shows you a preview of collected items
4. **Confirm** — your subscription is live. The scheduler runs your scripts on a cron schedule, deduplicates results, and pushes unread message cards to your inbox

> **💡 One-Click Managed Mode:** At any wizard step, click "Do it for me" and the AI will automatically complete all remaining steps in the background. You can monitor real-time progress or take over and switch back to manual mode at any time.

All API keys and AI provider configuration are stored inside the SQLite database (no environment variables needed beyond `DB_URL`). Everything runs in a single Node.js process.

---

## Features

| Feature | Description |
|---|---|
| 🤖 AI Source Discovery | Four-step wizard uses an AI agent with web search to find the best data sources for any topic |
| 🚀 One-Click Managed Mode | Click "Do it for me" at any wizard step — AI completes all remaining steps in the background with real-time progress and takeover support |
| 📝 Auto Script Generation | AI generates, validates, and repairs JavaScript collection scripts that run in a secure V8 sandbox |
| 📅 Cron Scheduling | Per-source cron schedules (`node-cron`), concurrent execution limited to 5 sandboxes via `p-limit` |
| 📬 Message Center | Unified cross-subscription inbox with unread/read states, criteria-match highlights, and 30-second polling badge |
| 🔍 Criteria Matching | Keyword-level (instant) + LLM-level (background) matching with visual `✓`/`✗` / metric-value display |
| 🔧 AI Script Repair | One-click AI repair of failed sources with streaming progress and apply-on-confirm workflow |
| 📊 Analysis Reports | AI-generated HTML analysis reports streamed into an isolated iframe |
| 🌐 Any OpenAI-Compatible LLM | Works with OpenAI, Ollama, Groq, DeepSeek, Cloudflare AI, or any OpenAI-compatible endpoint |
| 📡 RssHub Integration | Built-in RssHub route radar — automatically detects RSS feeds for thousands of websites |
| 📱 Mobile-First Design | Responsive layout: bottom tab bar, swipe-friendly cards, iOS safe-area support |
| 🔒 Secure Sandbox | Scripts run inside `isolated-vm` (same V8 isolation as Cloudflare Workers): 64 MB memory cap, 30 s timeout, 5 HTTP requests max |
| 💾 SQLite + WAL | Single-file database with WAL mode for concurrent reads; no external database required |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 App Router · React 19 · TypeScript · Tailwind CSS · shadcn/ui |
| Backend | Next.js API Routes · Custom Node.js HTTP server (`server.ts`) |
| Database | SQLite · Drizzle ORM · `better-sqlite3` · WAL mode |
| Scheduler | `node-cron` · `p-limit` (max 5 concurrent sandbox executions) |
| AI | OpenAI SDK (any OpenAI-compatible endpoint) |
| Script Sandbox | `isolated-vm` (V8 native Isolate API) |
| Search | Tavily API · Serper API |
| RSS Discovery | RssHub route radar |
| Deployment | Docker (multi-stage) · Local Node.js |

---

## Quick Start with Docker (Recommended)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose plugin)

### 1. Clone the repository

```bash
git clone https://github.com/freez-ai/subscribe-anything.git
cd subscribe-anything
```

### 2. Start the container

```bash
docker compose up -d
```

The first build takes a few minutes because `isolated-vm` is compiled from source.

### 3. Open the app

```
http://localhost:3000
```

### 4. Configure an LLM provider

Go to **Settings → AI Provider** and add your provider:

| Field | Example (OpenAI) | Example (Ollama local) |
|---|---|---|
| Name | OpenAI GPT-4o | Ollama Llama3 |
| Base URL | `https://api.openai.com/v1` | `http://host.docker.internal:11434/v1` |
| API Key | `sk-...` | `ollama` |
| Model ID | `gpt-4o` | `llama3.1:8b` |

> **Tip:** Any OpenAI-compatible API works — Groq, DeepSeek, Cloudflare Workers AI, etc.

### 5. (Optional) Configure a search provider

Go to **Settings → Search Provider** and enter a [Tavily](https://tavily.com) or [Serper](https://serper.dev) API key. This is required for the **Find Sources** step in the wizard.

### Persistent data

All data is stored in `./data/subscribe-anything.db`. The `docker-compose.yml` mounts this directory as a volume:

```yaml
volumes:
  - ./data:/app/data
```

Restart the container safely:

```bash
docker compose restart
```

Stop and remove containers (data is preserved):

```bash
docker compose down
```

---

## Local Development

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | **22 LTS** | `isolated-vm` native module requires Node 22 on Windows |
| npm | ≥ 10 | Bundled with Node 22 |
| Python 3 | any | Required to compile `isolated-vm` and `better-sqlite3` native modules |
| Build tools | gcc / MSVC | See OS-specific notes below |

### OS-specific setup

**macOS**

Xcode Command Line Tools are sufficient:

```bash
xcode-select --install
```

**Windows**

Install [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools) or manually install:
- [Node.js 22 LTS](https://nodejs.org/) (includes npm)
- [Python 3](https://www.python.org/downloads/)
- Visual Studio Build Tools with the **"Desktop development with C++"** workload

After installing, rebuild native modules:

```bash
npm rebuild isolated-vm
npm rebuild better-sqlite3
```

**Linux (Debian/Ubuntu)**

```bash
sudo apt-get install -y python3 make g++
```

### Installation steps

```bash
# 1. Clone
git clone https://github.com/freez-ai/subscribe-anything.git
cd subscribe-anything

# 2. Install dependencies (compiles native modules)
npm install

# 3. Verify isolated-vm built correctly
node -e "require('isolated-vm'); console.log('OK')"

# 4. Generate database migrations (first time only)
npm run db:generate

# 5. Start the development server
npm run dev
```

Open `http://localhost:3000`.

> The database file is created automatically at `./data/subscribe-anything.db` on first startup.

### Available scripts

```bash
npm run dev          # Start dev server (tsx server.ts, hot reload)
npm run build        # Production build (next build + compile server.ts)
npm run start        # Start production server (node dist/server.js)
npm run db:push      # Push schema changes directly (dev only)
npm run db:generate  # Generate Drizzle migration files
npm run db:migrate   # Run pending migrations
```

---

## Building Docker Image Manually

```bash
# Build image
docker build -t subscribe-anything .

# Run container
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  -e DB_URL=/app/data/subscribe-anything.db \
  --name subscribe-anything \
  subscribe-anything
```

> **Note:** The Dockerfile uses `node:22-bookworm-slim` (Debian-based) intentionally — Alpine (musl libc) has compatibility issues with `isolated-vm` and Playwright's Chromium dependencies.

---

## Configuration

All configuration is done through the Settings UI — no `.env` file required.

### LLM Providers (Settings → AI Provider)

You can add multiple providers and switch between them at any time. Each prompt template can be pinned to a specific provider.

| Setting | Description |
|---|---|
| Name | Display name for the provider |
| Base URL | OpenAI-compatible API base URL |
| API Key | Your API key |
| Model ID | Model name (e.g. `gpt-4o`, `claude-3-5-sonnet`, `llama3.1:8b`) |
| Extra Headers | Optional JSON object for extra HTTP headers |

### Search Provider (Settings → Search)

Required for the "Find Sources" step in the wizard.

| Provider | Sign up | Free tier |
|---|---|---|
| [Tavily](https://tavily.com) | tavily.com | 1,000 searches/month |
| [Serper](https://serper.dev) | serper.dev | 2,500 searches free |

### RssHub Instance (Settings → RssHub)

By default points to the public `https://rsshub.app`. To use a self-hosted instance, update the Base URL.

### Prompt Templates (Settings → Prompts)

All AI agent prompts are editable and can be reset to defaults at any time:

| Template | Used by |
|---|---|
| `find-sources` | Wizard step 2 — discovers data sources via web search |
| `generate-script` | Wizard step 3 — writes and validates collection scripts |
| `validate-script` | Script validation quality check |
| `repair-script` | Source repair agent |
| `analyze-subscription` | Analysis report generation |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  server.ts  (single Node.js process)                    │
│                                                         │
│  1. runMigrations()  ← SQLite WAL, seed templates       │
│  2. initScheduler()  ← node-cron + p-limit(5)           │
│  3. Next.js HTTP handler                                │
└─────────────────────────────────────────────────────────┘
         │
         ├── /api routes (Next.js Route Handlers)
         │
         ├── Scheduler ──→ collector.ts
         │                   │
         │                   ├── isolated-vm sandbox (runScript)
         │                   ├── deduplication (SHA-256 hash)
         │                   ├── criteria matching (keyword + LLM)
         │                   └── message_cards INSERT
         │
         └── AI Agents (SSE streaming)
               ├── findSourcesAgent    (webSearch tool)
               ├── generateScriptAgent (webFetch + validateScript)
               ├── repairScriptAgent   (webFetch + validateScript)
               └── analyzeAgent        (no tools, pure generation)
```

### Script Sandbox Security

Collection scripts run inside `isolated-vm` — V8's native Isolate API (same technology used by Cloudflare Workers):

- **Memory limit:** 64 MB per Isolate
- **Execution timeout:** 30 seconds
- **HTTP requests:** max 5 per run, 5 MB response size limit
- **Static safety check:** scripts containing `require(`, `import from`, `process.`, `eval`, `new Function(`, `fs`, `child_process` are rejected before entering the isolate
- **Available globals:** `fetch` (proxied), `URL`, `URLSearchParams`, standard JavaScript built-ins

---

## Environment Variables

Only one environment variable is used at runtime. Everything else is stored in the database.

| Variable | Default | Description |
|---|---|---|
| `DB_URL` | `./data/subscribe-anything.db` | Path to the SQLite database file |
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Set to `production` in Docker |

---

## Project Structure

```
subscribe-anything/
├── server.ts                    # Custom server: migrations → scheduler → Next.js
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout (AppShell + Toaster)
│   │   ├── subscriptions/       # Subscription list, wizard, detail, sources
│   │   ├── messages/            # Inbox + read history
│   │   ├── settings/            # LLM providers, prompts, search, RssHub
│   │   └── api/                 # All API route handlers
│   ├── components/
│   │   ├── layout/              # AppShell, NavSidebar, BottomNav, AppBar
│   │   ├── subscriptions/       # Cards, detail, message grid/timeline
│   │   ├── wizard/              # 4-step wizard components
│   │   └── settings/            # Provider form, prompt editor
│   └── lib/
│       ├── ai/
│       │   ├── client.ts        # OpenAI client factory + token tracking
│       │   └── agents/          # findSources, generateScript, repair, analyze
│       ├── db/
│       │   ├── schema.ts        # All 7 Drizzle table definitions
│       │   └── migrate.ts       # Migration runner + prompt seeding
│       ├── sandbox/
│       │   ├── runner.ts        # isolated-vm execution engine
│       │   └── safety.ts        # Static pattern checks
│       └── scheduler/
│           ├── jobManager.ts    # node-cron + p-limit task registry
│           └── collector.ts     # Full collection pipeline
├── Dockerfile                   # Multi-stage build
├── docker-compose.yml
└── drizzle/                     # Auto-generated SQL migrations
```

---

## Contributing

Pull requests are welcome. For large changes, please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes
4. Push to the branch: `git push origin feat/my-feature`
5. Open a Pull Request

---

## License

[MIT](LICENSE)
