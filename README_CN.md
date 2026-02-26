<div align="center">

<img src="public/android-chrome-512x512.png" width="120" alt="订阅万物 Logo" />

# 订阅万物 · Subscribe Anything

**AI 驱动的智能数据订阅平台**

[English](README.md)

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-WAL-green?logo=sqlite)](https://sqlite.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](https://docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![screenshot](docs/screenshot.png)

</div>

---

## 这是什么？

订阅万物是一个自托管的智能数据订阅平台。你可以订阅**任意主题**——人物动态、商品价格、技术进展、市场资讯——并在满足自定义条件时收到提醒。无需手动配置 RSS 或编写爬虫，AI 智能体全程自动完成：

1. **描述主题**（如"Rust 语言新闻"）和可选的监控指标（如"Star 数超过 1000"）
2. **AI 自动发现 5–10 个数据源**，优先使用 RSS / API 接口
3. **审核并选择**要订阅的数据源
4. **AI 为每个数据源生成 JavaScript 采集脚本**，在沙箱中验证，并预览采集到的内容
5. **确认完成** — 订阅立即生效，系统按 cron 计划自动采集、去重，未读消息卡片推送至收件箱

所有 API Key 和 AI 供应商配置存储在 SQLite 数据库中，无需维护 `.env` 文件。整个系统运行在单一 Node.js 进程中。

---

## 功能特性

| 功能 | 说明 |
|---|---|
| 🤖 AI 自动发现数据源 | 五步向导，AI 智能体通过网络搜索为任意主题找到最佳数据源 |
| 📝 自动生成采集脚本 | AI 编写、验证、修复 JavaScript 采集脚本，在安全 V8 沙箱中执行 |
| 📅 Cron 定时调度 | 每个订阅源独立 cron 计划，通过 `p-limit` 限制最多 5 个沙箱并发 |
| 📬 消息中心 | 跨订阅统一收件箱，未读/已读状态管理，条件命中高亮，30 秒轮询角标 |
| 🔍 监控指标匹配 | 关键词匹配（即时）+ LLM 精确匹配，展示 `✓`/`✗` 及指标原始值 |
| 🔧 AI 智能修复 | 一键 AI 修复失效数据源，流式展示修复过程，确认后应用 |
| 📊 数据分析报告 | AI 生成 HTML 格式分析报告，流式渲染在隔离 iframe 中 |
| 🌐 支持任意 OpenAI 兼容接口 | 兼容 OpenAI、Ollama、Groq、DeepSeek、Cloudflare AI 等 |
| 📡 RssHub 集成 | 内置 RssHub 路由雷达，自动检测数千个网站的 RSS 接口 |
| 📱 移动端优先设计 | 响应式布局，底部标签栏，支持 iOS 安全区和触控手势 |
| 🔒 安全沙箱执行 | `isolated-vm`（V8 原生 Isolate）：64MB 内存上限，30 秒超时，最多 5 次 HTTP 请求 |
| 💾 SQLite + WAL | 单文件数据库，WAL 模式支持并发读写，无需外部数据库 |

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | Next.js 15 App Router · React 19 · TypeScript · Tailwind CSS · shadcn/ui |
| 后端 | Next.js API Routes · 自定义 Node.js HTTP 服务器（`server.ts`） |
| 数据库 | SQLite · Drizzle ORM · `better-sqlite3` · WAL 模式 |
| 调度 | `node-cron` · `p-limit`（最多 5 个沙箱并发） |
| AI | OpenAI SDK（兼容任意 OpenAI 兼容接口） |
| 脚本沙箱 | `isolated-vm`（V8 原生 Isolate API） |
| 搜索 | Tavily API · Serper API |
| RSS 发现 | RssHub 路由雷达 |
| 部署 | Docker 多阶段构建 · 本地 Node.js |

---

## Docker 快速启动（推荐）

### 前置条件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)（或 Docker Engine + Compose 插件）

### 1. 克隆仓库

```bash
git clone https://github.com/freez-ai/subscribe-anything.git
cd subscribe-anything
```

### 2. 启动容器

```bash
docker compose up -d
```

首次构建需要几分钟，因为 `isolated-vm` 需要从源码编译。

### 3. 打开应用

```
http://localhost:3000
```

### 4. 配置 LLM 供应商

进入**设置 → AI 供应商**添加你的供应商：

| 字段 | 示例（OpenAI） | 示例（本地 Ollama） |
|---|---|---|
| 名称 | OpenAI GPT-4o | Ollama Llama3 |
| Base URL | `https://api.openai.com/v1` | `http://host.docker.internal:11434/v1` |
| API Key | `sk-...` | `ollama` |
| 模型 ID | `gpt-4o` | `llama3.1:8b` |

> **提示：** 任意 OpenAI 兼容 API 均可使用——Groq、DeepSeek、Cloudflare Workers AI 等。

### 5.（可选）配置搜索供应商

进入**设置 → 搜索供应商**，填入 [Tavily](https://tavily.com) 或 [Serper](https://serper.dev) 的 API Key。向导的"发现数据源"步骤需要此配置。

### 数据持久化

所有数据存储在 `./data/subscribe-anything.db`。`docker-compose.yml` 已将此目录挂载为卷：

```yaml
volumes:
  - ./data:/app/data
```

安全重启容器：

```bash
docker compose restart
```

停止并移除容器（数据不会丢失）：

```bash
docker compose down
```

---

## 本地开发环境搭建

### 前置条件

| 要求 | 版本 | 说明 |
|---|---|---|
| Node.js | **22 LTS** | Windows 上编译 `isolated-vm` 原生模块需要 Node 22 |
| npm | ≥ 10 | 随 Node 22 自带 |
| Python 3 | 任意版本 | 编译 `isolated-vm` 和 `better-sqlite3` 原生模块所需 |
| 构建工具 | gcc / MSVC | 详见各平台说明 |

### 各平台配置

**macOS**

安装 Xcode 命令行工具即可：

```bash
xcode-select --install
```

**Windows**

安装以下工具：
- [Node.js 22 LTS](https://nodejs.org/)
- [Python 3](https://www.python.org/downloads/)
- Visual Studio Build Tools，勾选**"使用 C++ 的桌面开发"**工作负载

安装完成后重新编译原生模块：

```bash
npm rebuild isolated-vm
npm rebuild better-sqlite3
```

> **Windows 替代方案：** 也可以直接使用 [Docker Desktop](https://www.docker.com/products/docker-desktop/) 进行开发，避免本地编译原生模块的复杂性。

**Linux (Debian/Ubuntu)**

```bash
sudo apt-get install -y python3 make g++
```

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/freez-ai/subscribe-anything.git
cd subscribe-anything

# 2. 安装依赖（会自动编译原生模块）
npm install

# 3. 验证 isolated-vm 编译成功
node -e "require('isolated-vm'); console.log('OK')"

# 4. 生成数据库迁移文件（仅首次需要）
npm run db:generate

# 5. 启动开发服务器
npm run dev
```

打开 `http://localhost:3000`。

> 首次启动时，数据库文件会自动创建在 `./data/subscribe-anything.db`。

### 可用命令

```bash
npm run dev          # 启动开发服务器（热重载）
npm run build        # 生产构建（next build + 编译 server.ts）
npm run start        # 启动生产服务器（node dist/server.js）
npm run db:push      # 直接推送 Schema 变更（仅开发环境）
npm run db:generate  # 生成 Drizzle 迁移文件
npm run db:migrate   # 执行待处理的迁移
```

---

## 手动构建 Docker 镜像

```bash
# 构建镜像
docker build -t subscribe-anything .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  -e DB_URL=/app/data/subscribe-anything.db \
  --name subscribe-anything \
  subscribe-anything
```

> **注意：** Dockerfile 使用 `node:22-bookworm-slim`（基于 Debian）而非 Alpine。原因是 Alpine 使用 musl libc，与 `isolated-vm` 和 Playwright Chromium 依赖存在兼容性问题。

---

## 配置说明

所有配置均通过设置界面完成，无需 `.env` 文件。

### LLM 供应商（设置 → AI 供应商）

支持添加多个供应商并随时切换。每个提示词模板可以单独绑定特定供应商。

| 配置项 | 说明 |
|---|---|
| 名称 | 供应商显示名称 |
| Base URL | OpenAI 兼容 API 的基础 URL |
| API Key | 你的 API 密钥 |
| 模型 ID | 模型名称，如 `gpt-4o`、`claude-3-5-sonnet`、`llama3.1:8b` |
| 额外请求头 | 可选 JSON 对象，用于传递额外 HTTP 请求头 |

**常见兼容供应商配置示例：**

| 供应商 | Base URL |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| Ollama（本地） | `http://localhost:11434/v1` |
| Ollama（Docker 内） | `http://host.docker.internal:11434/v1` |
| Cloudflare Workers AI | `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1` |

### 搜索供应商（设置 → 搜索供应商）

向导"发现数据源"步骤所需。

| 供应商 | 注册地址 | 免费额度 |
|---|---|---|
| [Tavily](https://tavily.com) | tavily.com | 1,000 次/月 |
| [Serper](https://serper.dev) | serper.dev | 2,500 次免费 |

### RssHub 实例（设置 → RssHub）

默认使用公共实例 `https://rsshub.app`。如有自建实例，在此修改 Base URL。

[自建 RssHub 指引 →](https://docs.rsshub.app/deploy/)

### 提示词模板（设置 → 提示词）

所有 AI 智能体提示词均可编辑，支持随时恢复默认：

| 模板 ID | 用途 |
|---|---|
| `find-sources` | 向导第二步：通过网络搜索发现数据源 |
| `generate-script` | 向导第四步：编写和验证采集脚本 |
| `validate-script` | 脚本验证质量审查 |
| `repair-script` | 订阅源修复智能体 |
| `analyze-subscription` | 分析报告生成 |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│  server.ts  （单一 Node.js 进程）                         │
│                                                         │
│  1. runMigrations()  ← SQLite WAL 模式 + 初始化提示词     │
│  2. initScheduler()  ← node-cron + p-limit(5) 并发限制   │
│  3. Next.js HTTP 处理器                                  │
└─────────────────────────────────────────────────────────┘
         │
         ├── /api 路由（Next.js Route Handlers）
         │
         ├── 调度器 ──→ collector.ts（采集管道）
         │                   │
         │                   ├── isolated-vm 沙箱执行脚本
         │                   ├── 去重（SHA-256 哈希）
         │                   ├── 监控指标匹配（关键词 + LLM）
         │                   └── 写入 message_cards 表
         │
         └── AI 智能体（SSE 流式传输）
               ├── findSourcesAgent    工具：webSearch
               ├── generateScriptAgent 工具：webFetch + validateScript
               ├── repairScriptAgent   工具：webFetch + validateScript
               └── analyzeAgent        无工具，纯生成
```

### 采集脚本沙箱安全模型

| 保护层 | 机制 |
|---|---|
| 静态检查 | 禁止 `require`、`import`、`process`、`eval`、`fs` 等危险模式 |
| V8 隔离 | `isolated-vm` — V8 原生 Isolate（与 Cloudflare Workers 相同技术） |
| 内存限制 | 每个 Isolate 64 MB |
| 执行超时 | 30 秒 |
| 网络限制 | 每次运行最多 5 次 HTTP 请求，单次响应上限 5 MB |
| 可用 API | `fetch`（代理）、`URL`、`URLSearchParams`、标准 JS 内置对象 |

### 数据库表结构

| 表名 | 用途 |
|---|---|
| `llm_providers` | AI 供应商配置（多供应商，单激活） |
| `prompt_templates` | 可编辑的 AI 提示词模板 |
| `search_provider_config` | 搜索 API 配置（单行记录） |
| `subscriptions` | 用户订阅项 |
| `sources` | 订阅源（含采集脚本） |
| `message_cards` | 采集到的内容卡片（消息中心主体） |
| `notifications` | 订阅源生命周期事件通知 |

---

## 环境变量

运行时仅需一个环境变量，其余配置均通过设置界面存入数据库。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DB_URL` | `./data/subscribe-anything.db` | SQLite 数据库文件路径 |
| `PORT` | `3000` | HTTP 服务监听端口 |
| `NODE_ENV` | `development` | Docker 中设为 `production` |

---

## 常见问题

**Q: isolated-vm 安装失败怎么办？**

此模块需要编译 C++ 原生代码。请确认：
- Windows：已安装 Node.js 22 LTS 和 Visual Studio Build Tools（含 C++ 工作负载）
- macOS：已运行 `xcode-select --install`
- Linux：已安装 `python3 make g++`

然后运行 `npm rebuild isolated-vm`。

**Q: 向导第二步报"搜索供应商未配置"？**

进入**设置 → 搜索供应商**，配置 Tavily 或 Serper 的 API Key，然后返回重试。

**Q: 支持 Ollama 等本地模型吗？**

支持。在**设置 → AI 供应商**中添加供应商，Base URL 填写你的 Ollama 地址。Docker 环境中访问宿主机 Ollama 需使用 `http://host.docker.internal:11434/v1`。

**Q: 如何备份数据？**

直接复制 `./data/subscribe-anything.db` 文件即可。建议在服务停止时备份以确保一致性。

**Q: 调度器任务是否会因服务重启而丢失？**

不会。每次服务启动时，调度器会自动从数据库重新加载所有启用状态的订阅源并注册 cron 任务。

**Q: 采集脚本能访问哪些外部资源？**

仅能通过 `fetch` 发起 HTTP/HTTPS 请求，每次运行最多 5 次，无法访问文件系统、执行系统命令或使用 Node.js 内置模块。

---

## 参与贡献

欢迎提交 Pull Request。对于较大的功能改动，建议先开 Issue 讨论方案。

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feat/my-feature`
3. 提交变更
4. 推送到分支：`git push origin feat/my-feature`
5. 发起 Pull Request

---

## 许可证

[MIT](LICENSE)
