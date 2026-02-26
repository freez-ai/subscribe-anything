# 订阅万物 — 项目计划

## 项目背景

目标是构建一个智能数据订阅平台：用户订阅任意主题（人物、商品、技术、概念等），配置可选的监控指标，系统自动发现数据源、生成采集脚本、定时获取数据，满足条件时推送提醒。

**技术栈（已确定）：**
- 前端：Next.js 14 App Router + React + TypeScript + Tailwind CSS + shadcn/ui
- 后端：Next.js API Routes + 自定义 Node.js 服务器（用于持久化调度器）
- 数据库：SQLite + Drizzle ORM（better-sqlite3）
- 调度：node-cron 运行在自定义服务器进程中
- AI：OpenAI SDK（支持任意 OpenAI 兼容接口，通过设置页面配置）
- 采集脚本：JavaScript（由 AI 生成，在 isolated-vm 沙箱中执行）
- 部署：Docker / 本地 Node.js
- **响应式适配：桌面端 + 移动端双端支持，移动优先（Mobile First）设计原则**

---

## 项目结构

```
subscribe-anything/
├── server.ts                          # 自定义服务器：Next.js + 数据库迁移 + 调度器启动
├── tsconfig.server.json               # server.ts 专用 tsconfig（CommonJS 输出）
├── next.config.mjs
├── drizzle.config.ts
├── tailwind.config.ts
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .env.local
├── drizzle/                           # drizzle-kit 生成的 SQL 迁移文件
│   └── 0000_init.sql
├── data/                              # 运行时数据目录（Docker volume 挂载点）
│   └── subscribe-anything.db
└── src/
    ├── app/
    │   ├── layout.tsx                 # 根布局（AppShell）
    │   ├── page.tsx                   # 重定向 → /subscriptions
    │   ├── subscriptions/
    │   │   ├── page.tsx               # 订阅列表
    │   │   ├── new/page.tsx           # 新建订阅向导
    │   │   └── [id]/
    │   │       ├── page.tsx           # 订阅详情（消息卡片）
    │   │       └── sources/page.tsx   # 订阅源卡片列表
    │   ├── settings/page.tsx          # 配置页（LLM / 提示词 / 搜索 三个标签）
    │   ├── messages/
    │   │   ├── page.tsx               # 消息中心（未读收件箱）
    │   │   └── read/page.tsx          # 已读历史（独立入口）
    │   └── api/
    │       ├── subscriptions/route.ts               # GET 列表，POST 新建
    │       ├── subscriptions/[id]/route.ts           # GET、PATCH、DELETE
    │       ├── subscriptions/[id]/message-cards/route.ts # GET 分页消息卡片（全部）
    │       ├── subscriptions/[id]/analyze/route.ts   # POST → 流式 HTML 分析报告
    │       ├── sources/route.ts                     # GET 订阅源列表（?subscriptionId=）
    │       ├── sources/[id]/route.ts                 # GET、PATCH、DELETE
    │       ├── sources/[id]/trigger/route.ts          # POST → 手动触发采集
    │       ├── sources/[id]/repair/route.ts           # POST → 流式智能体修复
    │       ├── message-cards/route.ts                 # GET 消息卡片（支持 ?status=unread|read|all）
    │       ├── message-cards/[id]/route.ts            # GET 单条消息卡片
    │       ├── message-cards/[id]/read/route.ts       # POST 标记已读（写入 readAt）
    │       ├── message-cards/read-all/route.ts        # POST 全部标记已读
    │       ├── message-cards/unread-count/route.ts    # GET { count } 未读总数
    │       ├── notifications/route.ts                 # GET 订阅源通知列表（?subscriptionId= 过滤）
    │       ├── notifications/[id]/read/route.ts       # POST 标记订阅源通知已读
    │       ├── settings/llm-providers/route.ts         # GET、POST
    │       ├── settings/llm-providers/[id]/route.ts    # PATCH、DELETE
    │       ├── settings/llm-providers/[id]/activate/route.ts # POST 设为激活
    │       ├── settings/prompt-templates/route.ts      # GET 所有模板
    │       ├── settings/prompt-templates/[id]/route.ts # PATCH 修改内容
    │       ├── settings/prompt-templates/[id]/reset/route.ts # POST 恢复默认
    │       ├── settings/search-provider/route.ts       # GET、PUT 更新配置
    │       ├── wizard/find-sources/route.ts            # POST → SSE 第二步智能体
    │       └── wizard/generate-scripts/route.ts        # POST → SSE 第四步智能体
    ├── components/
    │   ├── ui/                        # shadcn/ui 组件
    │   ├── layout/
    │   │   ├── AppShell.tsx
    │   │   ├── NavSidebar.tsx         # 桌面端左侧导航（md: 可见）
    │   │   ├── BottomNav.tsx          # 移动端底部标签栏（md: 隐藏）
    │   │   ├── AppBar.tsx             # 移动端顶部应用栏（标题 + 返回）
    │   │   └── MessageBell.tsx        # 桌面端顶部未读角标，每 30 秒轮询
    │   ├── subscriptions/
    │   │   ├── SubscriptionList.tsx
    │   │   ├── SubscriptionCard.tsx
    │   │   ├── SubscriptionDetailHeader.tsx
    │   │   ├── MessageCardGrid.tsx           # 网格布局（订阅详情页）
    │   │   ├── MessageCardTimeline.tsx       # 时间线布局（订阅详情页）
    │   │   ├── MessageCard.tsx               # 消息卡片（含已读状态样式）
    │   │   └── AnalysisReportDialog.tsx      # 在 iframe 中流式渲染 HTML 报告
    │   ├── message-center/
    │   │   ├── MessageCenterInbox.tsx        # 未读消息卡片列表（跨订阅）
    │   │   ├── MessageCenterReadHistory.tsx  # 已读消息卡片列表（独立入口）
    │   │   └── MessageCenterCard.tsx         # 消息中心专用卡片（含订阅名、来源名）
    │   ├── wizard/
    │   │   ├── WizardShell.tsx           # 步骤路由 + 进度条
    │   │   ├── Step1Topic.tsx
    │   │   ├── Step2AgentChat.tsx        # SSE 流式对话窗口
    │   │   ├── Step3ReviewSources.tsx    # 复选框列表 + 预览
    │   │   ├── Step4ScriptGen.tsx        # 逐源代码生成 + 验证状态
    │   │   └── Step5Preview.tsx          # 最终订阅源卡片预览
    │   ├── sources/
    │   │   ├── SourceCardList.tsx
    │   │   ├── SourceCard.tsx
    │   │   └── RepairDialog.tsx          # 流式修复智能体对话
    │   ├── settings/
    │   │   ├── LLMProviderList.tsx
    │   │   ├── LLMProviderForm.tsx
    │   │   ├── PromptTemplateEditor.tsx
    │   │   └── SearchProviderForm.tsx
    │   └── notifications/
    │       ├── NotificationList.tsx          # 系统通知列表（订阅源状态事件）
    │       └── NotificationItem.tsx
    ├── lib/
    │   ├── db/
    │   │   ├── index.ts               # Drizzle 连接单例
    │   │   ├── schema.ts              # 所有表定义及关联关系
    │   │   └── migrate.ts             # 执行迁移 + 初始化提示词模板
    │   ├── ai/
    │   │   ├── client.ts              # OpenAI 客户端工厂（从数据库读取激活供应商）
    │   │   ├── agents/
    │   │   │   ├── findSourcesAgent.ts    # 向导第二步
    │   │   │   ├── generateScriptAgent.ts # 向导第四步
    │   │   │   ├── repairScriptAgent.ts   # 订阅源修复
    │   │   │   └── analyzeAgent.ts        # 订阅数据分析
    │   │   └── tools/
    │   │       ├── webSearch.ts           # Tavily/Serper 搜索工具封装
    │   │       ├── webFetch.ts            # 服务端 HTTP 抓取工具（generateScript/repair 使用）
    │   │       └── validateScript.ts      # 沙箱试运行工具
    │   ├── sandbox/
    │   │   ├── runner.ts              # isolated-vm 执行引擎
    │   │   ├── safety.ts              # 执行前静态模式检查
    │   │   └── contract.ts            # CollectedItem 接口定义
    │   ├── scheduler/
    │   │   ├── index.ts               # initScheduler()，由 server.ts 调用
    │   │   ├── jobManager.ts          # Map<sourceId, ScheduledTask>，增删改查
    │   │   └── collector.ts           # 完整采集管道：执行→去重→持久化→通知
    │   ├── notifications/
    │   │   └── index.ts               # createNotification() 助手函数
    │   └── utils/
    │       ├── hash.ts                # hash(title + url) 用于去重
    │       ├── cron.ts                # CRON_PRESETS 预设 + 表达式验证
    │       └── streamResponse.ts      # ReadableStream SSE 工具函数
    └── types/
        ├── db.ts                      # Drizzle $inferSelect / $inferInsert 类型
        ├── api.ts                     # 请求/响应 DTO
        └── script.ts                  # 脚本 SDK 接口类型
```

新增（移动端适配）：
- `src/hooks/useIsMobile.ts` — 基于 `matchMedia('(max-width: 767px)')` 检测移动端
- `src/hooks/useSafeArea.ts` — 读取 iOS `safe-area-inset-bottom`，用于底部导航偏移
- `src/hooks/useKeyboardVisible.ts` — 监听移动端软键盘弹出/收起（`visualViewport` API）

---

## 响应式设计方案

### 核心原则

- **移动优先**：所有样式以移动端为基准，通过 `md:`、`lg:` 断点向上扩展
- **断点定义**：移动端 `< 768px`，桌面端 `≥ 768px`（与 Tailwind `md:` 对齐）
- **触控友好**：可交互元素最小触控区域 44×44px，使用 `touch-manipulation` 防止点击延迟
- **iOS 安全区**：底部导航栏使用 `env(safe-area-inset-bottom)` 适配全面屏手机
- **键盘适配**：表单页面在移动端键盘弹出时自动滚动使输入框可见

### 导航结构差异

| 区域 | 桌面端 | 移动端 |
|---|---|---|
| 主导航 | 左侧固定侧边栏（NavSidebar） | 底部标签栏（BottomNav） |
| 未读消息入口 | 顶部 MessageBell 图标 | 底部 BottomNav 消息标签角标 |
| 页面标题/操作栏 | 页面顶部 PageHeader | 顶部应用栏（AppBar）带返回按钮 |

**布局切换方式：**
```tsx
// 侧边栏：仅桌面端显示
<NavSidebar className="hidden md:flex" />

// 底部导航：仅移动端显示
<BottomNav className="flex md:hidden" />

// 主内容区：移动端无左边距，桌面端留出侧边栏宽度
<main className="pb-16 md:pb-0 md:ml-64">
```

新增组件：
- `src/components/layout/BottomNav.tsx` — 移动端底部标签栏（订阅、消息、设置）
- `src/components/layout/AppBar.tsx` — 移动端顶部应用栏（标题 + 返回 + 操作按钮）

### 各页面响应式布局

**订阅列表页**
- 移动端：单列卡片列表，卡片左滑显示"禁用/删除"操作（swipe actions）
- 桌面端：2-3 列卡片网格，鼠标悬停显示操作按钮
- 新建订阅按钮：移动端为右下角悬浮 FAB（`fixed bottom-20 right-4`），桌面端为页面右上角

**新建订阅向导**
- 移动端：每一步占满屏幕，底部固定"下一步"按钮（避免被键盘遮挡）
- 桌面端：固定宽度居中卡片（`max-w-2xl`），步骤指示器横排显示
- Step 2 智能体对话：移动端仿原生聊天 UI（底部固定输入区，消息区上方滚动），桌面端固定高度滚动区域

**订阅详情页**
- 移动端：默认时间线布局（更适合竖向滚动），网格/时间线切换按钮保留
- 桌面端：默认网格布局（2-3 列），时间线作为备选
- MessageCard：移动端横向全宽，缩略图左侧固定宽度；桌面端纵向卡片，缩略图顶部；未读卡片以蓝点或加粗标题区分，已读卡片降低对比度

**订阅源列表页**
- 移动端：折叠式列表（Accordion），每项展开查看详情和操作
- 桌面端：卡片网格（2 列），信息密度更高

**配置页**
- 移动端：标签栏改为顶部横向滚动 Tab，各分组内容全宽展示；供应商列表每项可点击进入详情子页
- 桌面端：三栏横向 Tab + 内容区布局不变

**消息中心**
- 移动端：全屏未读收件箱列表，卡片全宽展示（含订阅主题标签、来源名、标题、摘要、时间）；底部无新增标签，已读历史通过页内"已读历史"链接进入
- 桌面端：`max-w-3xl` 居中单列布局；顶部操作栏含"全部已读"和"已读历史"入口

### 触控交互规范

- **列表左滑操作**（移动端）：使用 `@use-gesture/react` 或自定义 touch 事件，滑动显示操作按钮
- **下拉刷新**（移动端订阅列表、消息中心）：使用 `react-pull-to-refresh` 或原生 touch 实现
- **模态弹窗**：移动端改为从底部滑入的 Sheet（`vaul` 组件，shadcn/ui 内置），桌面端保持 Dialog
- **长按菜单**（移动端卡片）：长按 MessageCard 或 SourceCard 弹出操作菜单（Context Menu）

```tsx
// Sheet 代替 Dialog 示例（移动端）
import { useIsMobile } from '@/hooks/useIsMobile';
const isMobile = useIsMobile(); // window.innerWidth < 768

return isMobile
  ? <Sheet><SheetContent side="bottom">...</SheetContent></Sheet>
  : <Dialog>...</Dialog>;
```

### 自定义 Hook

- `src/hooks/useIsMobile.ts` — 检测当前是否为移动端（基于 `matchMedia`）
- `src/hooks/useSafeArea.ts` — 获取 iOS 安全区高度，用于底部导航偏移
- `src/hooks/useKeyboardVisible.ts` — 监听移动端软键盘弹出/收起（调整布局）

---

## 数据库 Schema

```typescript
// src/lib/db/schema.ts — 所有表（SQLite + Drizzle ORM）

// llm_providers：多个 OpenAI 兼容供应商，同时只有一个 isActive
// 字段：id(uuid)、name、baseUrl、apiKey、modelId、headers(JSON)、isActive、totalTokensUsed(INTEGER DEFAULT 0)、createdAt、updatedAt

// prompt_templates：可编辑的 AI 提示词，支持恢复默认，不可删除
// 字段：id(字符串键)、name、description、content、defaultContent、updatedAt

// search_provider_config：单行记录（id='default'），搜索 API 配置
// 字段：id、provider('tavily'|'serper'|'none')、apiKey、updatedAt

// subscriptions：用户订阅项
// 字段：id(uuid)、topic、criteria、isEnabled、unreadCount、totalCount、lastUpdatedAt、createdAt、updatedAt

// sources：订阅源，包含 AI 生成的采集脚本
// 字段：id(uuid)、subscriptionId(fk→级联删除)、title、description、url、script、cronExpression、
//       isEnabled、status('active'|'failed'|'disabled'|'pending')、
//       lastRunAt、lastRunSuccess、lastError、nextRunAt、
//       totalRuns、successRuns、itemsCollected、createdAt、updatedAt

// message_cards：采集到的内容卡片，是消息中心的主体内容
// 字段：id(uuid)、subscriptionId(fk→级联删除)、sourceId(fk→级联删除)、
//       contentHash(title+url 的哈希，用于去重)、
//       title、summary、thumbnailUrl、sourceUrl、
//       publishedAt(来源发布时间，可为空)、
//       meetsCriteriaFlag(是否满足监控指标，用于高亮)、
//       readAt(已读时间戳，null 表示未读)、
//       rawData(JSON，原始采集数据，用于重新分析)、
//       createdAt

// notifications：订阅源卡片状态通知，仅记录订阅源生命周期事件
// 字段：id(uuid)、type('source_created'|'source_fixed'|'source_failed')、
//       title、body、isRead、
//       subscriptionId(fk，用于在订阅页过滤)、
//       relatedEntityType('source')、relatedEntityId、
//       createdAt
```

**关键索引：**
- `UNIQUE(content_hash, source_id)` — 在 message_cards 上强制去重
- `(subscription_id, read_at IS NULL, created_at DESC)` — 未读消息查询（消息中心主视图）
- `(subscription_id, created_at DESC)` — 订阅详情页全量消息查询
- `(read_at IS NULL, created_at DESC)` — 跨订阅未读消息聚合（消息中心）
- `(is_enabled, status)` — 调度器加载启用的订阅源

---

## AI 智能体设计

### 智能体循环模式（所有智能体共用）

所有智能体直接使用 OpenAI SDK（`openai.chat.completions.create`，参数 `stream: true, tools: [...]`），通过手动工具分发循环实现 Agentic Loop。兼容任意 OpenAI 兼容接口（Ollama、Groq 等）。

```
while (true) {
  流式接收响应 → 通过 SSE 向客户端发送 text_delta 事件
  若无 tool_calls → 退出循环
  执行每个工具调用 → 将结果追加到历史记录 → 继续
}
```

### 智能体列表

| 智能体 | 文件 | 工具 | 用途 |
|---|---|---|---|
| findSourcesAgent | `lib/ai/agents/findSourcesAgent.ts` | `webSearch` | 向导第二步：查找 5-10 个订阅源 |
| generateScriptAgent | `lib/ai/agents/generateScriptAgent.ts` | `webFetch`、`validateScript` | 向导第四步：为每个源编写并验证 JS 脚本 |
| repairScriptAgent | `lib/ai/agents/repairScriptAgent.ts` | `webFetch`、`validateScript` | 修复失效的订阅源脚本 |
| analyzeAgent | `lib/ai/agents/analyzeAgent.ts` | 无 | 生成 HTML 格式分析报告 |

### 提示词模板 ID（数据库初始化时写入）

- `find-sources` — 引导智能体搜索订阅源
- `generate-script` — 引导智能体为订阅源编写 JS 采集脚本
- `repair-script` — 引导智能体调试并修复失效脚本
- `analyze-subscription` — 引导智能体生成 HTML 分析报告

### 流式传输到客户端（SSE）

所有向导/智能体 API 路由通过 Web `ReadableStream` 返回 `Content-Type: text/event-stream`。客户端组件使用 `fetch` 配合流式 reader（而非 `EventSource`）来处理 POST 请求。

---

## 脚本沙箱设计

**使用库：`isolated-vm`**（不使用 vm2 —— vm2 存在 CVE 级别的沙箱逃逸漏洞）

`isolated-vm` 使用 V8 原生 Isolate API（与 Cloudflare Workers 使用相同技术）。

**强制约束：**
- 内存：每个 Isolate 限制 64 MB
- 超时：单次执行最长 30 秒
- 最大 HTTP 请求数：每次运行 5 次（通过代理 fetch）
- 响应体大小上限：5 MB
- 执行前静态禁止模式检查：`require(`、`import from`、`process.`、`eval`、`new Function(`、`fs`、`child_process` 等

**脚本约定**（`src/lib/sandbox/contract.ts`）：
```typescript
interface CollectedItem {
  title: string;        // 必填
  url: string;          // 必填
  summary?: string;
  thumbnailUrl?: string;
  publishedAt?: string; // ISO 8601 格式
}
// 脚本必须导出：async function collect(): Promise<CollectedItem[]>
// 可用全局变量：fetch（代理）、URL、URLSearchParams
```

---

## 调度器设计

**运行在 `server.ts` 中** —— 自定义 Next.js 服务器进程。使用 `node-cron`。

```
server.ts 启动流程：
  1. runMigrations() — 确保数据库 Schema 为最新版本，初始化提示词模板
  2. initScheduler() — 加载所有启用的订阅源，注册 cron 任务
  3. createServer() — 启动 Next.js HTTP 处理器

jobManager.ts：
  Map<sourceId, ScheduledTask>
  模块级 limit = pLimit(5) — 同一时刻最多 5 个沙箱并发，超出任务排队等待槽位释放
  scheduleSource(source)     — 注册/替换 cron 任务；cron 回调通过 limit() 排队执行
  unscheduleSource(sourceId) — 停止并移除任务
  reloadSource(sourceId)     — 当 API 路由更新或切换订阅源时调用

collector.ts 每次运行流程（cron 触发时经 limit() 队列；POST /trigger 手动触发时直接调用，不进队列）：
  1. 在 isolated-vm 沙箱中执行 runScript(source.script)
  2. 对每个条目：计算 hash(title+url)，查询 message_cards 是否已存在（content_hash + source_id）
  3. 新条目：插入 message_cards，readAt=null（未读）；若满足监控指标（关键词匹配）则同时置 meetsCriteriaFlag=true
  4. 脚本成功后：更新 source 统计（lastRunAt、nextRunAt、totalRuns、successRuns、itemsCollected）；成功时将 status 重置为 'active'
  5. 更新 subscription.unreadCount（+新增条目数）、totalCount（+新增条目数）、lastUpdatedAt
  6. 脚本出错时：source.status='failed'，
     写入 notifications({ type: 'source_failed', subscriptionId, relatedEntityId: sourceId })
```

---

## Docker 部署

**Dockerfile：** 多阶段构建（builder → runner），将 `server.ts` 编译为 `dist/server.js`。

**docker-compose.yml：**
```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    volumes: ["./data:/app/data"]  # SQLite 持久化存储
    environment:
      - NODE_ENV=production
      - DB_URL=/app/data/subscribe-anything.db
    restart: unless-stopped
```

所有 LLM API Key 和搜索供应商 Key 通过设置页面存储在 SQLite 数据库中，不写入环境变量。

---

## 重点风险与对策

### 风险 1：并发采集导致 OOM

**场景：** isolated-vm 虽然轻量，但若整点（如 `0 * * * *`）同时触发 50 个 cron 任务，CPU 和内存会瞬间飙升，可能导致服务 OOM 重启。

**对策：** 在 `jobManager.ts` 中引入 `p-limit`，限制同一时刻最多并行运行 **5 个沙箱实例**，其余任务排队等待槽位释放。

**实施要点：**
- 安装 `p-limit` 依赖（ESM 包，需在 `tsconfig.server.json` 中配置 `"moduleResolution": "bundler"` 或使用动态 import）
- `jobManager.ts` 维护模块级 `limit = pLimit(5)` 实例
- `scheduleSource` 的 cron 回调包裹为 `limit(() => collect(source))`
- `POST /api/sources/[id]/trigger` 手动触发**绕过队列**直接执行，不应让用户主动操作排队等待

---

### 风险 2：大模型 Token 消耗失控

**场景：** 找源、写脚本、验证、修复、分析报告，整个工作流 Token 消耗可观。若用户使用自有 API Key，可能快速耗尽额度。

**对策：** 在 `llm_providers` 表中记录累计 Token 消耗，每次 agent 调用结束后将 OpenAI 响应的 `usage.total_tokens` 累加；在配置页供应商卡片中展示"已消耗 X tokens"。

**实施要点：**
- `llm_providers` 表新增 `totalTokensUsed INTEGER DEFAULT 0` 字段（已在 schema 中体现）
- `lib/ai/client.ts` 封装 `trackUsage(db, providerId, tokens)` 助手，在每次 agent 完成后调用
- 配置页 LLM 供应商卡片展示累计消耗量
- 分析报告弹窗入口处显示"本次预计消耗约 N tokens"（按选取卡片数 × 平均 token 粗估，给用户决策依据）

---

### 风险 3：SQLite 写入锁竞争（SQLITE_BUSY）

**场景：** better-sqlite3 默认以 journal 模式运行，调度器高频写入 `message_cards` 的同时前端频繁标记已读，可能偶发 `SQLITE_BUSY` 错误。

**对策：** 数据库初始化时开启 **WAL（Write-Ahead Logging）模式**，允许多读单写并发，大幅减少锁竞争。

**实施要点：**
- 在 `migrate.ts` 完成迁移后立即执行：
  ```typescript
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL'); // WAL 模式下 NORMAL 足够安全，性能优于 FULL
  ```
- 两条 pragma 在每次服务启动时均需执行（重启不会丢失 WAL 设置，但显式执行更可靠）
- `data/` 目录下会出现 `.db-wal` 和 `.db-shm` 辅助文件；Docker volume 挂载整个 `data/` 目录即可，无需额外配置

---

## 实施阶段

每个阶段结束后必须满足其"验收条件"才能进入下一阶段。

---

### 阶段 0 — 环境与脚手架

**目标：** 项目可启动，基础布局可见，关键原生依赖构建成功。

**任务：**
1. `npx create-next-app@latest` 初始化项目（TypeScript、Tailwind、App Router、src 目录）
2. 安装运行时依赖：
   - `drizzle-orm better-sqlite3` — 数据库
   - `openai` — AI 客户端
   - `node-cron cron-parser` — 调度与下次运行时间计算
   - `isolated-vm` — 脚本沙箱（原生模块，**必须在此阶段验证构建成功**）
   - `p-limit` — cron 采集并发控制（限制同时最多 5 个沙箱实例）
   - `@use-gesture/react` — 移动端手势
3. 安装开发依赖：`drizzle-kit @types/better-sqlite3 @types/node-cron tsx`
4. `npx shadcn@latest init`，安装基础组件：`button card badge switch tabs input textarea select dialog sheet scroll-area separator toast`
5. 编写 `src/lib/db/schema.ts`（全部 7 张表）和 `drizzle.config.ts`
6. 编写 `src/lib/db/migrate.ts`：完成迁移后立即执行 `db.pragma('journal_mode = WAL')` 和 `db.pragma('synchronous = NORMAL')` 开启 WAL 模式；执行 `npm run db:push` 生成数据库
7. 编写 `server.ts` 框架（占位，暂不启动调度器），配置 `tsconfig.server.json`
8. 实现 AppShell + NavSidebar（桌面端）+ BottomNav（移动端）+ AppBar；配置 viewport meta 标签
9. 实现 `src/hooks/useIsMobile.ts`、`useSafeArea.ts`、`useKeyboardVisible.ts`

**验收条件：**
- `node -e "require('isolated-vm')"` 执行无报错（验证原生模块构建成功）
- `npm run dev` 启动后访问 `http://localhost:3000` 能看到含侧边栏/底部导航的空白布局
- `data/subscribe-anything.db` 文件已生成，用 DB 浏览器（如 DB Browser for SQLite）可见全部 7 张空表；执行 `PRAGMA journal_mode` 返回 `wal`
- 在 Chrome DevTools 切换到 375px 视口：底部导航显示，侧边栏隐藏

---

### 阶段 1 — 配置页与基础设施

**前提：** 阶段 0 验收通过。

**目标：** 配置页面完整可用；沙箱可执行脚本；AI 客户端可创建。

**任务：**
1. 实现 LLM 供应商 API 路由（`GET/POST /api/settings/llm-providers`、`PATCH/DELETE /api/settings/llm-providers/[id]`、`POST /api/settings/llm-providers/[id]/activate`）
2. 实现提示词模板 API 路由（`GET /api/settings/prompt-templates`、`PATCH /api/settings/prompt-templates/[id]`、`POST .../reset`）
3. 实现搜索供应商 API 路由（`GET/PUT /api/settings/search-provider`）
4. 在 `migrate.ts` 中写入 4 条默认提示词模板（`find-sources`、`generate-script`、`repair-script`、`analyze-subscription`）
5. 实现 `src/lib/ai/client.ts`：从数据库读取 `isActive=true` 的供应商，构造 OpenAI 实例；若无激活供应商抛出明确错误；封装 `trackUsage(db, providerId, tokens)` 助手，每次 agent 完成后将 `usage.total_tokens` 累加到 `llm_providers.totalTokensUsed`
6. 实现沙箱三件套：`sandbox/contract.ts`（接口定义）、`sandbox/safety.ts`（静态检查）、`sandbox/runner.ts`（isolated-vm 执行，含代理 fetch、超时、内存限制）
7. 实现工具函数：`hash.ts`（`crypto.createHash('sha256')`）、`cron.ts`（预设列表 + `cron-parser` 验证）、`streamResponse.ts`（SSE ReadableStream 封装）
8. 实现配置页 UI：LLM 供应商列表/表单（增删改激活），每个供应商卡片显示"已消耗 X tokens"（来自 `totalTokensUsed`）；提示词编辑器（含"恢复默认"）；搜索供应商表单；桌面端 Tab 布局，移动端横向滚动 Tab

**验收条件：**
- 配置页能新增一个 LLM 供应商并设为激活；刷新页面后数据保留
- 配置页能修改提示词内容、点击"恢复默认"后内容恢复为 `defaultContent`；不出现删除按钮
- 在浏览器控制台执行以下验证，沙箱返回正确结果：
  ```
  POST /api/settings/llm-providers → 201
  GET /api/settings/prompt-templates → 返回 4 条记录
  ```
- 编写并在 Node.js REPL 中直接调用 `runner.ts`，执行一个 `collect()` 返回 `[{title:'test',url:'http://example.com'}]` 的脚本，确认能拿到结果
- 沙箱执行含 `require('fs')` 的脚本时被 `safety.ts` 拦截并返回错误，不进入 isolated-vm

---

### 阶段 2 — 订阅 CRUD 与调度器骨架

**前提：** 阶段 1 验收通过。

**目标：** 可以创建和管理订阅项；调度器随服务器启动，不报错。

**任务：**
1. 实现订阅 API 路由：`GET/POST /api/subscriptions`、`GET/PATCH/DELETE /api/subscriptions/[id]`
2. 实现订阅源列表路由：`GET /api/sources?subscriptionId=` （含分页）、`GET/PATCH/DELETE /api/sources/[id]`
3. 实现 `src/lib/scheduler/jobManager.ts`：初始化模块级 `limit = pLimit(5)`；实现 `scheduleSource()`（cron 回调通过 `limit()` 排队执行）、`unscheduleSource()`、`reloadSource()`；`scheduleSource` 在此阶段只记录日志，不执行真实采集
4. 实现 `src/lib/scheduler/index.ts`（`initScheduler()`）：启动时查询所有 `isEnabled=true` 且 `status != 'pending'` 的源，注册 cron 任务
5. 更新 `server.ts`：启动时依次调用 `runMigrations()` → `initScheduler()` → `createServer()`
6. 实现订阅列表页面：SubscriptionList + SubscriptionCard（含 topic、状态、`unreadCount` 未读角标、`totalCount`、lastUpdatedAt）
7. 实现启用/禁用切换（乐观更新，失败回滚）：
   - **订阅源**切换（`PATCH /api/sources/[id]`）：`isEnabled=false` 时调用 `unscheduleSource()`，`isEnabled=true` 时调用 `scheduleSource()`
   - **订阅项**切换（`PATCH /api/subscriptions/[id]`）：`isEnabled=false` 时遍历该订阅的所有源并逐一调用 `unscheduleSource()`，`isEnabled=true` 时重新调度所有 `status='active'` 的源
8. **LLM 前置检查**：在 `/subscriptions/new` 的页面入口处，先 `GET /api/settings/llm-providers`，若无激活供应商，显示提示并跳转到配置页
9. 移动端：新建订阅按钮为右下角 FAB（`fixed bottom-20 right-4 z-50`），桌面端为右上角按钮

**验收条件：**
- `npm run dev` 启动时控制台输出调度器初始化日志（如 `[Scheduler] Loaded 0 sources`），无报错
- 订阅列表页面：可新增一条订阅（题目+可选指标）、可删除、可切换启用/禁用，刷新后数据保留
- 切换某一**订阅源**的 `isEnabled=false` → 服务器日志出现 `[Scheduler] Unscheduled source xxx`；重新切换为 `true` → 出现 `[Scheduler] Scheduled source xxx`
- 切换某一**订阅项**的 `isEnabled=false` → 该订阅下所有源的调度日志均出现 Unscheduled
- 访问 `/subscriptions/new` 且无激活 LLM 供应商时，页面显示提示并提供"前往配置"链接
- 移动端（375px 视口）：FAB 按钮可见且不被底部导航遮挡

---

### 阶段 3 — 新建订阅向导

**前提：** 阶段 2 验收通过；已在配置页中配置好 LLM 供应商和搜索供应商（Tavily 或 Serper）。

**目标：** 五步向导可完整运行，最终生成订阅项和订阅源。

**任务：**
1. 实现 `src/lib/ai/tools/webSearch.ts`：封装 Tavily API（`POST https://api.tavily.com/search`）和 Serper API，根据配置选用；无配置时返回明确错误提示
2. 实现 `src/lib/ai/tools/validateScript.ts`：调用 `runner.ts` 执行脚本并返回 `{success, items?, error?}`
3. 实现 `src/lib/ai/agents/findSourcesAgent.ts`：Agentic Loop，工具为 `webSearch`，最终输出 JSON 数组（包含 title、url、description）
4. 实现 `POST /api/wizard/find-sources`：流式 SSE，接收 `{topic, criteria}`，驱动 findSourcesAgent
5. 实现 `src/lib/ai/agents/generateScriptAgent.ts`：接收单个 source，工具为 `webFetch`（真实 HTTP 请求，非沙箱内）和 `validateScript`，最多重试 3 次；最终输出 `{script, cronExpression, initialItems}` —— `initialItems` 取最后一次 `validateScript` 成功调用的返回值，作为该源的初始内容
6. 实现 `POST /api/wizard/generate-scripts`：接收确认后的 sources 数组，对每个源依次或并发运行 generateScriptAgent，流式推送逐源进度事件（`{type:'source_progress', sourceIndex, status, script?, items?, error?}`）
7. 实现 WizardShell 步骤管理（状态保持在组件内，刷新不丢失可通过 sessionStorage 临时保存）
8. 实现 Step1Topic：Topic 输入框 + 可选 Criteria，移动端底部固定"下一步"
9. 实现 Step2AgentChat：消费 `/api/wizard/find-sources` SSE 流，渲染对话气泡和工具调用进度；**若搜索供应商未配置，在此步显示错误并提供"前往配置"入口**
10. 实现 Step3ReviewSources：复选框列表，每项有"在新标签页打开"链接（不用 iframe，避免 CSP 问题）
11. 实现 Step4ScriptGen：对每个选中的源显示独立进度卡片（等待中/生成中/验证中/成功/失败），失败的源不阻塞其他源，最终允许部分成功继续；**成功的源将 `items` 存入向导状态，作为后续步骤的初始消息卡片数据**
12. 实现 Step5Preview：展示生成成功的源卡片（含 title、url、cronExpression 可修改、启用开关）以及每个源验证阶段已采集到的条目数预览（如"已获取 12 条内容"）；"完成"按钮调用 `POST /api/subscriptions` 一次性创建订阅及所有源，请求体中每个源附带 `initialItems` 字段；API 在插入源记录后立即将 `initialItems` 写入 `message_cards`（逐条计算 `contentHash`、跳过哈希冲突、`readAt=null`、若 criteria 匹配则 `meetsCriteriaFlag=true`），并初始化 `subscription.unreadCount` 和 `totalCount`；最后为每个源写入 `notifications({ type: 'source_created', subscriptionId, relatedEntityId: sourceId })` 并注册调度
13. 移动端：各步骤全屏；Step2 对话区域使用 `flex-col` + 底部输入固定（仅展示，无用户输入）

**验收条件：**
- Step1 → Step2：输入"GitHub 开源热门项目"，观察到 AgentChat 中出现工具调用消息和源列表，共找到至少 3 个可访问 URL
- Step3：取消勾选至少一个源后继续，Step4 只为选中的源生成脚本
- Step4：至少一个源的脚本验证通过（`validateScript` 返回 success），进度卡片变为绿色，并显示采集到的条目数
- Step4 某源验证失败：该源卡片显示错误信息，其余源不受影响
- Step5："完成"后 `GET /api/subscriptions` 能看到新订阅；`GET /api/sources?subscriptionId=...` 能看到对应源；**`GET /api/message-cards?status=unread` 立即能看到由验证步骤采集的初始消息卡片，无需等待首次 cron 运行**；`subscription.unread_count` 和 `total_count` 与初始卡片数一致
- 调度器日志显示新源已被注册（如 `[Scheduler] Scheduled source xxx with cron 0 */6 * * *`）
- 移动端（375px）：向导各步骤在小屏幕下内容不溢出，底部按钮可点击

---

### 阶段 4 — 采集引擎

**前提：** 阶段 3 验收通过；数据库中存在至少一个带有有效脚本的订阅源。

**目标：** 手动触发采集成功写入 MessageCard；去重生效；监控指标命中时置 `meetsCriteriaFlag`；脚本失败时写入订阅源通知。

**任务：**
1. 实现 `src/lib/notifications/index.ts`：`createNotification(db, payload)` 助手函数，向 notifications 表写入记录
2. 实现 `src/lib/scheduler/collector.ts`：
   - 调用 `runner.ts` 执行脚本
   - 对每个返回条目计算 `hash(title + url)`，查询 `message_cards` 是否已存在（按 `content_hash` + `source_id`）
   - 新条目以 `readAt=null`（未读）写入 `message_cards`
   - 若订阅有 `criteria`：关键词简单匹配（将 criteria 分词，检查 title+summary 是否包含），命中则 `meetsCriteriaFlag=true`；AI 精确匹配作为后续增强，不阻塞本阶段；**不写入 notifications 表，仅靠卡片字段表达**
   - 脚本成功后：更新 source 的 `lastRunAt`、`lastRunSuccess=true`、`totalRuns+1`、`successRuns+1`、`itemsCollected+=newCount`；用 `cron-parser` 计算并写入 `nextRunAt`；成功时将 `status` 重置为 `'active'`（兼容从 failed 修复后的首次成功运行）
   - 脚本失败后：更新 `lastRunSuccess=false`、`lastError`、`status='failed'`；调用 `createNotification({ type: 'source_failed' })`
   - 更新 `subscription.unreadCount`（+新增条目数）、`totalCount`（+新增条目数）和 `lastUpdatedAt`
3. 将 `collector.ts` 接入 `jobManager.ts`（替换占位日志）
4. 实现 `POST /api/sources/[id]/trigger`：**绕过 p-limit 队列**，直接调用 `collector.ts`，同步返回 `{ newItems, skipped, error? }`（手动触发应立即响应，不应排队等待）
5. 验证去重逻辑：同一 `content_hash` + `source_id` 不重复写入（依赖 UNIQUE 索引）

**验收条件：**
- 调用 `POST /api/sources/[id]/trigger` → 响应包含 `newItems` 数量，数据库 `message_cards` 表出现新记录，且 `read_at` 字段为 null
- 再次触发同一源 → `newItems=0`，`skipped` 等于上次条数，`message_cards` 无新增行
- `subscription.unread_count` 和 `total_count` 数值正确递增
- 将源脚本改为错误代码 → 触发 → `source.status='failed'`，`notifications` 表出现 `type='source_failed'` 且 `subscription_id` 正确的记录
- 恢复脚本后重新触发 → `source.status='active'`，`last_error` 为空
- 若 criteria 关键词在新条目 title/summary 中出现 → `meets_criteria_flag=1`，**不**写入 notifications 表（仅靠卡片标志位表达）
- `source.next_run_at` 写入正确（当前时间之后的合法时间戳）

---

### 阶段 5 — 消息中心

**前提：** 阶段 4 验收通过；`message_cards` 表中已有未读数据。

**目标：** 消息中心作为跨订阅统一收件箱，展示未读消息卡片；已读历史可通过独立入口查看；未读角标实时显示。

**说明：** 消息中心在订阅详情页之前实现，使阶段 4 的采集结果能立即被验证。

**任务：**
1. 实现消息卡片 API 路由：
   - `GET /api/message-cards?status=unread`：所有订阅下 `readAt IS NULL` 的消息卡片，按 `createdAt DESC`，支持分页；响应每条附带 `subscriptionTopic` 和 `sourceName`（JOIN 查询）
   - `GET /api/message-cards?status=read`：所有 `readAt IS NOT NULL` 的卡片，按 `readAt DESC`，支持按 `subscriptionId` 筛选
   - `GET /api/message-cards/unread-count`：返回 `{ count: number }`，全局未读总数
   - `POST /api/message-cards/[id]/read`：将 `readAt` 设为当前时间；同步将对应订阅的 `unreadCount` 减 1
   - `POST /api/message-cards/read-all`：批量设所有未读为已读；重置各订阅 `unreadCount` 为 0
2. 实现系统通知 API（轻量，供订阅页使用）：
   - `GET /api/notifications?subscriptionId=`：按订阅 ID 过滤，返回未读订阅源通知，按 `createdAt DESC`
   - `POST /api/notifications/[id]/read`：设 `isRead=true`
3. 实现消息中心页面（`/messages`）：
   - **默认视图（未读收件箱）** —— `MessageCenterInbox` 组件：
     - 每张 `MessageCenterCard` 展示：订阅主题标签、来源名称、标题、截断摘要、缩略图（若有）、发布时间、`meetsCriteriaFlag` 红色"!"角标
     - 点击卡片 → 调用 `POST .../read`（写入 readAt）→ 从未读列表移除 → 新标签页打开 `sourceUrl`
     - 顶部操作栏："全部已读"按钮 ＋ 右侧"已读历史"入口链接
     - 移动端：卡片全宽，缩略图右侧固定尺寸；桌面端：`max-w-3xl` 居中
   - **已读历史视图** —— 路由 `/messages/read`，`MessageCenterReadHistory` 组件：
     - 展示所有已读卡片，每张卡片右下角显示"已读于 XX 分钟前"（`readAt` 相对时间）
     - 顶部下拉菜单可按订阅筛选
     - 移动端通过消息中心页内"已读历史"链接进入，不新增底部导航标签
4. 实现 MessageBell（桌面端顶部）/ BottomNav 消息标签角标（移动端）：
   - 挂载时立即请求一次 `GET /api/message-cards/unread-count`
   - 每 30 秒轮询一次；未读数 > 0 显示角标，= 0 隐藏

**验收条件：**
- 消息中心默认视图能看到阶段 4 采集产生的未读消息卡片；每张卡片正确显示订阅主题和来源名称
- `meetsCriteriaFlag=true` 的卡片有红色"!"角标
- 点击卡片 → DB 中 `read_at` 字段被写入 → 卡片从未读列表消失 → 浏览器新标签页打开目标链接
- 点击"全部已读"→ 未读列表清空；进入"已读历史"可见刚才的卡片，并显示 `readAt` 相对时间
- "已读历史"按订阅筛选后，只显示该订阅下的已读卡片
- 未读角标数值与 `GET /api/message-cards/unread-count` 返回值一致
- 触发 trigger 产生新 message_card 后，最多等待 30 秒，角标自动更新（无需刷新）
- 移动端（375px）：卡片布局不溢出，角标在底部导航"消息"标签上清晰可见

---

### 阶段 6 — 订阅详情与订阅源管理

**前提：** 阶段 5 验收通过；`message_cards` 表和 sources 表已有数据。

**目标：** 可查看订阅消息卡片历史；AI 分析报告可生成；订阅源可管理；失效源可修复。

**任务：**
1. 实现 `GET /api/subscriptions/[id]/message-cards`：支持分页（`cursor` 或 `offset`）、排序（`createdAt DESC` 或 `publishedAt DESC`）；返回全部消息卡片（含已读和未读）；每条附带 `readAt` 字段
2. 实现订阅详情页面（`/subscriptions/[id]`）：
   - 顶部：SubscriptionDetailHeader（topic、criteria、isEnabled 开关、`unreadCount` 角标、"分析"按钮、"查看订阅源"链接）
   - 页面顶部展示该订阅未读的订阅源通知 Banner（`GET /api/notifications?subscriptionId=[id]`，仅 `isRead=false` 记录）；每条 Banner 可单独关闭（`POST /api/notifications/[id]/read`），关闭后刷新不再出现
   - 布局切换按钮（网格 / 时间线）
   - MessageCardGrid：移动端单列，桌面端 2-3 列；MessageCard 含缩略图、标题、摘要、时间、外链、`meetsCriteriaFlag` 角标、已读/未读视觉区分（未读加粗标题或蓝点）
   - MessageCardTimeline：移动端默认布局，时间轴形式竖向排列
   - 在此页面点击卡片同样调用 `POST /api/message-cards/[id]/read` 标记已读（与消息中心共用同一 API）
   - 滚动到底时加载更多（无限滚动）
3. 实现 AnalysisReportDialog（`POST /api/subscriptions/[id]/analyze`）：
   - 用户填写分析描述和数据范围（最近 N 条，默认 50，最多 100，防止超出上下文窗口）
   - 后端获取指定范围内的 message_cards（仅取 title + summary + publishedAt，不含 rawData，减少 token 用量）
   - 驱动 `analyzeAgent`（无工具，纯生成），流式输出 HTML 字符串
   - 前端用 `<iframe srcDoc={html}>` 渲染（隔离样式），移动端全屏弹窗
4. 实现订阅源列表页（`/subscriptions/[id]/sources`）：
   - 页面顶部同样展示该订阅未读的订阅源通知 Banner（复用与订阅详情页相同的 `GET /api/notifications?subscriptionId=` 查询和 Banner 组件），每条可单独关闭
   - 桌面端：两列卡片网格；移动端：Accordion 列表
   - SourceCard 显示：title、url、status badge、isEnabled 开关、cronExpression、lastRunAt、nextRunAt、totalRuns/successRuns、itemsCollected
   - "手动触发"按钮：调用 `POST /api/sources/[id]/trigger`，显示结果 toast
   - "修改频率"：Popover，提供预设 + 自定义输入（`cron-parser` 验证），提交后 `PATCH /api/sources/[id]`，调用 `reloadSource()`
   - `status='failed'` 时显示"AI 修复"按钮 → 打开 RepairDialog
5. 实现 `src/lib/ai/agents/repairScriptAgent.ts`：接收失败脚本 + lastError + sourceUrl，工具为 `webFetch` 和 `validateScript`，最多 3 轮修复；输出 `{success, script?, reason?}`
6. 实现 `POST /api/sources/[id]/repair`：流式 SSE，驱动 repairScriptAgent；修复成功时**不自动写入**，返回新脚本供用户确认
7. 实现 RepairDialog：
   - 展示流式修复过程（对话气泡 + 工具调用进度）
   - 修复成功后显示新脚本和"应用修复"按钮
   - "应用修复" → `PATCH /api/sources/[id]`（写入新脚本 + `status='active'` + 清空 `lastError`）→ `reloadSource()` → 关闭弹窗

**验收条件：**
- 订阅详情页能看到所有 MessageCard（含已读和未读），未读卡片有视觉区分（蓝点或加粗标题）
- 在订阅详情页点击未读卡片 → `read_at` 字段被写入 → 卡片变为已读样式 → 消息中心未读角标数同步减少（30 秒内自动更新）
- `meetsCriteriaFlag=true` 的卡片有视觉标记
- 订阅详情页 `unreadCount` 角标与数据库 `subscriptions.unread_count` 字段一致
- 点击"分析"→ 填写描述 → 弹窗中出现流式生成的 HTML 内容，渲染为可视报告（含标题、段落等格式）
- 消息卡片超过 100 条时，分析接口仍正常响应（取最近 50 条，不超时）
- 订阅源列表正确显示 `nextRunAt`（格式化为人类可读时间）
- 手动触发成功后弹出 toast 显示新增条目数
- 将某源脚本改为错误代码 → 触发采集使其变为 failed → 进入 RepairDialog → 观察修复过程流式输出 → 点击"应用修复" → `status` 变回 `'active'`，`last_error` 为空
- 订阅详情页和订阅源列表页顶部均显示 `source_failed` 类型的 Banner；关闭后刷新不再出现；数据库 `notifications.is_read` 字段变为 true；`source_created` Banner 在向导完成后首次进入订阅页时可见
- 移动端（375px）：订阅源列表为 Accordion，RepairDialog 为全屏 Sheet

---

### 阶段 7 — 完善与 Docker

**前提：** 阶段 6 验收通过，所有核心功能可用。

**目标：** 全应用健壮性完善；Docker 构建成功并可正常运行。

**任务：**
1. 为所有列表页添加空状态 UI（无订阅、无数据、无消息时的引导界面）
2. 为所有异步操作添加加载态（Skeleton 占位或 Spinner）
3. 为所有页面添加错误边界（`error.tsx`），避免局部错误导致整页崩溃
4. 统一所有 API 路由的错误响应格式：`{ error: string, code?: string }`，HTTP 状态码准确
5. 为所有 mutation 操作添加 Toast 通知（成功/失败）
6. 编写 `Dockerfile`（多阶段构建）：
   - **注意**：`isolated-vm` 是原生模块，builder 阶段需要安装构建工具（`build-essential python3`），runner 阶段使用 `node:23-bookworm-slim`（非 Alpine，避免 musl 兼容性问题）
   - builder：安装全部依赖 → `next build` → `tsc -p tsconfig.server.json`
   - runner：只复制 `node_modules`（含编译好的 isolated-vm 二进制）+ `.next` + `dist/server.js` + `drizzle/` + `public/`
7. 编写 `docker-compose.yml`，挂载 `./data` 目录
8. 配置 `package.json` scripts：`dev`（`tsx server.ts`）、`build`（`next build && tsc ...`）、`start`（`node dist/server.js`）

**验收条件：**
- 订阅列表为空时，页面显示引导文字和"新建订阅"按钮，不显示空白
- 网络请求失败时（可通过 DevTools Network 中 block URL 模拟），页面显示错误提示，不白屏
- `docker compose build` 执行成功，无构建错误（isolated-vm 二进制正常编译）
- `docker compose up` 后访问 `http://localhost:3000`：
  - 应用正常加载
  - 可完成"添加 LLM 供应商 → 新建订阅 → 手动触发 → 消息中心查看消息卡片 → 标记已读"完整流程
  - 重启容器（`docker compose restart`）后，之前创建的订阅和数据依然存在（SQLite 持久化验证）
- 在 Chrome DevTools Performance 面板中录制首页加载，LCP < 2.5 秒（localhost 环境）

---

## 端到端回归验收

各阶段完成后，在 Docker 环境中执行以下完整流程，确认全链路无回归：

1. **配置**：添加 LLM 供应商并激活 → 配置搜索供应商（Tavily）
2. **新建订阅**：主题"GitHub 热门项目"，指标"Star 数超过 1000" → 完成五步向导
3. **采集验证**：手动触发任意一个订阅源 → 确认消息中心出现未读消息卡片 → 再次触发确认无重复
4. **消息中心**：未读卡片有订阅主题标签和来源名称 → 点击卡片新标签页打开 → 卡片从未读列表移除；进入"已读历史"可见刚才的卡片及 `readAt` 时间
5. **跨页已读同步**：在订阅详情页点击另一张未读卡片 → 消息中心未读角标在 30 秒内自动减少
6. **告警验证**：若有关键词命中 → 消息卡片带红色"!"角标（`meetsCriteriaFlag=true`）；在订阅详情页和订阅源列表页顶部可见 `source_failed` 类型的订阅源通知 Banner（若采集曾失败过），Banner 可单独关闭
7. **分析报告**：进入订阅详情 → 点击"分析" → 确认 HTML 报告流式渲染
8. **修复流程**：将某源脚本破坏 → 触发失败 → AI 修复 → 确认恢复正常
9. **持久化**：`docker compose restart` → 确认数据不丢失，已读状态保留
10. **移动端**：Chrome DevTools 375px 视口下完整重复步骤 2-5
