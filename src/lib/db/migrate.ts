import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

const DB_PATH = process.env.DB_URL ?? 'data/subscribe-anything.db';
const MIGRATIONS_DIR = 'drizzle';

const DEFAULT_PROMPT_TEMPLATES = [
  {
    id: 'find-sources',
    name: '查找订阅源',
    description: '引导智能体通过网络搜索，为给定主题找到合适的数据源',
    content: `你是一个专业的信息源分析师。用户希望订阅关于"{{topic}}"的内容，监控条件为"{{criteria}}"。

**第一步：网络搜索**
使用 webSearch 工具搜索互联网，找到 5-10 个高质量的数据源。
- 搜索确认主题对应实体的**标准名称、官方名称及已知别名/昵称**
- 根据上一步获取的名称搜素可靠的订阅源网址
- 优先选择：有规律地更新内容（日更/周更）、内容与主题高度相关、可通过程序化方式抓取（有 RSS、API 或稳定的 HTML 结构）

**第二步：为每个数据源查询 RSS 路由**
将所有找到的网站**合并为一次** rssRadar 调用（传入 queries 列表）。rssRadar 几乎没有调用成本，且很多网站都有现成的 RSS 路由。
- **queries 只传裸域名**（如 bilibili.com、zhihu.com），不要传完整 URL、路径或用户 ID（如 space.bilibili.com/346563107 会匹配不到任何路由）
- rssRadar 返回匹配路由：templateUrl 包含 :param 占位符，所需参数值（用户 ID、专栏 ID 等）通常已在第一步的搜索结果中获取，直接填入即可；**无需再次搜索**（仅当第三步验证失败时才需补充搜索）
- rssRadar 无匹配路由：保留原始网页 URL；**严禁自行拼造 RSSHub 路径**（如 /zhihu/search/xxx），只有 rssRadar 返回的 templateUrl 才是真实路由

**第三步：验证 RSS URL 可用性**
将所有 RSS URL **合并为一次** checkFeed 调用（传入 feeds 列表，并行验证）。每项传入：
- \`url\`：填好参数的完整 RSS URL
- \`templateUrl\`：该 URL 所对应的 rssRadar templateUrl（验证 :param 是否全部替换且路径正确）
- \`keywords\`：实体的所有已知名称和别名组成的数组（任一命中即验证通过，避免因名称变体导致误判）

根据每项返回结果处理：
- \`valid: true\` → 保留
- \`templateMismatch: true\` → URL 结构有误（:param 未完整替换或路径错误）：修正后重新 checkFeed
- \`keywordFound: false\` → URL 结构正确但 feed 不含任何关键词（实体 ID 有误）：用 webSearch 搜索实体名称（如"张三 bilibili"）从页面读取正确 ID → 重新填入 templateUrl → 再次 checkFeed
- 其他失败（HTTP 错误等）→ 同上修复流程；修复仍失败则回退为原始网页 URL
- 原始网页 URL（非 RSS）无需验证

**输出**
以 JSON 数组格式输出，每项包含：
- \`title\`：数据源名称
- \`url\`：经过验证的 URL（有效 RSS 优先，否则为原始页面 URL）
- \`description\`：内容特点、更新频率及是否含监控指标（RSS 请注明路由名称；回退网页 URL 请注明原因）
- \`recommended\`：true = 质量高、更新频繁、抓取难度低（有效 RSS 优先标记）；false = 可订阅但质量或可访问性一般或无法满足监控条件
- \`canProvideCriteria\`（仅当监控条件不为"无"时）：true = 能抓到评估监控条件所需的指标数据；false = 无法获取

综合内容质量、更新频率、抓取难度，将最优质的 2-4 个源标记 recommended: true。`,
    defaultContent: '',
  },
  {
    id: 'generate-script',
    name: '生成采集脚本',
    description: '引导智能体为特定数据源编写 JavaScript 采集脚本',
    content: `你是一个专业的 JavaScript 数据采集工程师。请为以下数据源编写采集脚本：

数据源：{{title}}
URL：{{url}}
描述：{{description}}
监控条件：{{criteria}}

【沙箱环境 — isolated-vm V8，非 Node.js，非浏览器】
脚本格式：定义 async function collect() 返回 CollectedItem[]；可带 export 前缀，运行时自动去除。

可用 API（脚本内）：
• fetch(url, opts?) → { ok, status, statusText, text(), json() } — 最多 5 次/运行，单次上限 5 MB，不支持 body，无 res.headers
• URL（含 searchParams）、URLSearchParams
• 标准 JS：JSON / Array / Object / String / Number / RegExp / Promise / async/await / Map / Set / Date / Math

严禁（直接报错终止）：require/import · process/fs/Buffer/child_process · DOMParser/document/window · console · setTimeout/setInterval · atob/btoa · TextDecoder/TextEncoder
HTML 解析：只能用正则或字符串方法。

可用工具（探查数据源、辅助编写脚本）：
• webFetch(url)：获取页面内容（HTML 已预处理去噪）
• webFetchBrowser(url)：无头浏览器渲染，捕获动态页面及 XHR/Fetch 请求
• webSearch(query)：查找 API 文档、实体 ID 等辅助信息
• rssRadar(queries)：查询 RSS 路由数据库（当 URL 是网页而非 RSS 时可用）
• validateScript(script)：在沙箱中执行脚本并做 LLM 质量审查（必须调用）

脚本要求：
1. 必填：title（字符串）、url（字符串）
2. publishedAt（ISO 8601 精确到秒）—— 必须尽力提取真实发布时间：
   - RSS/Atom：解析 pubDate / published / updated / dc:date / dc:modified
   - HTML/API：提取 <time> 标签 datetime 属性、JSON 日期字段（publishedAt / created_at / date 等）、meta 标签
   - 仅有日期字符串（如 "2024-01-15"）：new Date("2024-01-15").toISOString() → "2024-01-15T00:00:00.000Z"
   - 数据源确实无时间信息：省略，服务端自动兜底
3. 可选：summary、thumbnailUrl
4. 无数据或解析失败返回 []；严禁构造虚假兜底条目（如 items.push({ title: '...', url: sourceUrl })）
5. 域名约束：脚本所有 fetch URL 必须在 {{domain}} 域名范围内，禁止跨域访问
6. 监控条件（不为"无"时）：每条记录添加 criteriaResult（'matched'|'not_matched'|'invalid'）和 metricValue（原始指标值，可选）

---

**第一步：判断数据源类型**
用 webFetch 直接抓取数据源 URL，根据响应决定方案：
- 响应含 XML feed 标志（\`<rss\`、\`<feed\`、\`<item\`、\`<entry\`）→ **RSS/Atom 方案**，套用下方模板
- 响应为 HTML 页面 → **第二步**
- 响应失败或内容为空 → 改用 **webFetchBrowser** 探查，再走第二步

**RSS/Atom 采集模板**（直接套用，RSS/XML 解析必须用 split+indexOf/slice，禁止对 XML 标签用正则）：
\`\`\`javascript
export async function collect() {
  const res = await fetch('RSS_URL_HERE');
  if (!res.ok) return [];
  const xml = await res.text();
  const items = [];
  const blocks = xml.split('<item>').slice(1);    // Atom feed: 改为 '<entry>'
  for (const block of blocks) {
    const end = block.indexOf('</item>');          // Atom feed: 改为 '</entry>'
    const item = end > 0 ? block.slice(0, end) : block;
    function pick(tag) {
      const open = '<' + tag + '>', close = '</' + tag + '>';
      const s = item.indexOf(open);
      if (s < 0) return '';
      const e = item.indexOf(close, s + open.length);
      let v = e > 0 ? item.slice(s + open.length, e) : item.slice(s + open.length);
      if (v.startsWith('<![CDATA[')) v = v.slice(9, v.lastIndexOf(']]>'));
      return v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
    }
    const title = pick('title');
    const url   = pick('link') || pick('guid');   // Atom feed: 从 <link href="..."> 提取 href 属性值
    if (!title || !url) continue;
    const entry = { title, url };
    const pub = pick('pubDate') || pick('published') || pick('updated') || pick('dc:date') || pick('dc:modified');
    if (pub) { try { entry.publishedAt = new Date(pub).toISOString(); } catch {} }
    const desc = pick('description') || pick('summary');
    if (desc) entry.summary = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    const imgMatch = (pick('description') || '').match(/src="([^"]+\.(jpg|jpeg|png|webp|gif)[^"]*)"/i);
    if (imgMatch) entry.thumbnailUrl = imgMatch[1];
    items.push(entry);
  }
  return items;
}
\`\`\`

**第二步：分析 HTML / API 结构（非 RSS 时）**
- HTML 含实际数据（文章列表、商品信息等）→ 根据 HTML 结构编写采集脚本
- HTML 为 SPA 骨架（仅 \`<div id="app">\` 等，内容极少）→ 用 webFetchBrowser 渲染，优先分析 capturedRequests 中的 API 端点，直接调用 API 编写脚本

**验证**
脚本写好后调用 validateScript（沙箱执行 → 采集 ≥1 条 → LLM 质量审查）。验证失败则按错误修复重试（最多 3 次）；结果含 suggestedScript 时优先用该脚本重新验证。

【正则斜杠陷阱 — 仅 HTML/API 解析时注意】
脚本以 JSON 字符串传输，\`\\/\` 会被反序列化为 \`/\`，导致正则提前闭合，报 "Invalid regular expression flags"。
解决：正则中匹配字面 \`/\` 时用字符类 \`[/]\` 代替 \`\\/\`。示例：匹配 \`</a>\` 写 \`/[<][/]a>/\` 而非 \`/<\\/a>/\`。`,
    defaultContent: '',
  },
  {
    id: 'validate-script',
    name: '校验采集脚本',
    description: '对采集脚本和采集结果进行 LLM 质量审查，验证数据真实性，可同时修复发现的问题',
    content: `你是一个严格的数据采集质量审查员。请对以下采集脚本和其执行结果进行全面质量审查。

数据源 URL：{{url}}
数据源描述：{{description}}
监控条件：{{criteria}}

待审查脚本：
\`\`\`javascript
{{script}}
\`\`\`

脚本执行结果（前 5 条）：
\`\`\`json
{{items}}
\`\`\`

请按以下两步完成审查：

**第一步：代码质量检查**
- 是否存在虚假数据兜底（如空结果时强制 push 默认项，或硬编码假 title/URL）？
- publishedAt 字段：采集结果中是否有真实的发布时间？若数据源包含时间信息（RSS pubDate、页面 <time> 标签、API 日期字段等）但脚本未提取 publishedAt，应判定为质量问题并在 fixedScript 中修复。
- 域名约束：脚本中所有 fetch 调用的 URL 是否都限制在数据源站点域名范围内？若存在访问第三方无关网站的 fetch，应视为质量问题。
- 若监控条件不为"无"，是否正确实现了 criteriaResult（'matched'|'not_matched'|'invalid'）和 metricValue 字段？

**第二步：数据真实性验证**
使用 webFetch 工具抓取采集结果前 2 条 URL，确认：
- 这些 URL 可以访问（HTTP 200 或重定向后可访问）
- 页面内容与采集到的 title 大致吻合（允许截断差异）
- 这些 URL 确实属于该数据源站点范围
注意：若 URL 因网络限制无法访问，应结合代码质量综合判断，不应仅因网络问题判定失败。

**输出格式（严格遵守）**
完成审查后输出 JSON 结果块：
\`\`\`json
{"valid": true, "reason": "简明说明（30字以内）"}
\`\`\`
若 valid=false 且问题可修复，在 JSON 块之后附上修复后的完整脚本：
\`\`\`javascript
// 修复后的完整脚本（仅在 valid=false 时提供）
\`\`\``,
    defaultContent: '',
  },
  {
    id: 'repair-script',
    name: '修复采集脚本',
    description: '引导智能体诊断并修复失效的采集脚本',
    content: `你是一个专业的 JavaScript 调试工程师。以下采集脚本运行失败，请帮助修复：

数据源 URL：{{url}}
错误信息：{{lastError}}
当前脚本：
\`\`\`javascript
{{script}}
\`\`\`

【执行环境 — isolated-vm V8 沙箱（非 Node.js，非浏览器）】
可用 API：fetch · URL · URLSearchParams · 标准 JS（JSON/Array/RegExp/Promise/Map/Set/Date/Math 等）
fetch 返回：{ ok, status, statusText, text(), json() } — 无 res.headers；每次运行最多 5 次，单次上限 5 MB
严禁：require/import · process/fs/Buffer/child_process · DOMParser/document/window · console · setTimeout/setInterval · atob/btoa · TextDecoder/TextEncoder
HTML 解析：只能用正则或字符串方法，不能用任何 DOM API。

请：
1. 使用 webFetch 工具重新获取页面，分析当前页面结构（可能已更新）
   - 若 HTML 为 SPA 骨架（内容极少），改用 webFetchBrowser 工具，分析 capturedRequests 中的 API 端点，直接调用 API 重写脚本
2. 结合上述环境约束诊断错误原因
3. 修复脚本；若页面确实无数据，返回空数组 []，严禁构造虚假兜底条目（如 items.push({ title: '...', url: sourceUrl }) 之类的 fallback）
4. 使用 validateScript 工具验证修复后的脚本
5. 最多尝试 3 次，输出最终的修复脚本`,
    defaultContent: '',
  },
  {
    id: 'analyze-subscription',
    name: '分析订阅数据',
    description: '引导智能体对订阅的消息卡片进行综合分析，生成 HTML 报告',
    content: `你是一个数据分析专家。请对以下订阅主题"{{topic}}"的最近 {{count}} 条内容进行深度分析。

用户的分析需求：{{analysisRequest}}

数据如下（JSON 格式）：
{{data}}

请生成一份完整的 HTML 分析报告，包含：
1. 执行摘要（关键发现）
2. 内容趋势分析
3. 值得关注的具体条目
4. 结论与建议

报告格式要求：
- 使用语义化 HTML（h1、h2、p、ul、table 等）
- 内嵌简单的 CSS 样式使报告美观易读
- 仅输出 HTML 内容，不要包含 \`\`\`html 代码块标记`,
    defaultContent: '',
  },
];

export async function runMigrations() {
  // Ensure data directory exists
  const fs = await import('fs');
  const path = await import('path');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);

  // Enable WAL mode before migrations
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Run Drizzle migrations from /drizzle directory
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log('[DB] Migrations complete');
  } catch (err) {
    // If migrations folder doesn't exist yet (first run without drizzle-kit generate),
    // use push-style schema creation via raw SQL
    console.warn('[DB] Migrations folder not found, using schema push fallback');
    bootstrapSchema(sqlite);
  }

  // Idempotent column additions for schema evolution
  try { sqlite.exec('ALTER TABLE message_cards ADD COLUMN criteria_result TEXT'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE message_cards ADD COLUMN metric_value TEXT'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE prompt_templates ADD COLUMN provider_id TEXT REFERENCES llm_providers(id) ON DELETE SET NULL'); } catch { /* already exists */ }
  // Backfill historical NULL published_at values with created_at so sorting by published_at is reliable
  try { sqlite.exec('UPDATE message_cards SET published_at = created_at WHERE published_at IS NULL'); } catch { /* ignore */ }
  try {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS rss_instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
  } catch { /* already exists */ }

  // Seed default prompt templates (idempotent)
  seedPromptTemplates(db);

  // Force-update defaultContent for all templates (so "Reset to Default" gives latest prompts).
  // Also update content when it hasn't been user-customized (content === defaultContent).
  for (const tpl of DEFAULT_PROMPT_TEMPLATES) {
    // If content is still the old default → update both
    sqlite
      .prepare(
        `UPDATE prompt_templates
           SET content = ?, default_content = ?, updated_at = ?
           WHERE id = ? AND content = default_content`
      )
      .run(tpl.content, tpl.content, Date.now(), tpl.id);
    // If content was customized → update only defaultContent
    sqlite
      .prepare(
        `UPDATE prompt_templates
           SET default_content = ?, updated_at = ?
           WHERE id = ? AND content != default_content`
      )
      .run(tpl.content, Date.now(), tpl.id);
  }

  // Seed default search provider config (idempotent)
  seedSearchProvider(db);

  // Seed default RSS instance (idempotent)
  seedRssInstance(sqlite);

  sqlite.close();
  console.log('[DB] Initialization complete');
}

function bootstrapSchema(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS llm_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      model_id TEXT NOT NULL,
      headers TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      total_tokens_used INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      content TEXT NOT NULL,
      default_content TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_provider_config (
      id TEXT NOT NULL DEFAULT 'default' PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'none',
      api_key TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      criteria TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      unread_count INTEGER NOT NULL DEFAULT 0,
      total_count INTEGER NOT NULL DEFAULT 0,
      last_updated_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      script TEXT NOT NULL DEFAULT '',
      cron_expression TEXT NOT NULL DEFAULT '0 */6 * * *',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      last_run_at INTEGER,
      last_run_success INTEGER,
      last_error TEXT,
      next_run_at INTEGER,
      total_runs INTEGER NOT NULL DEFAULT 0,
      success_runs INTEGER NOT NULL DEFAULT 0,
      items_collected INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_cards (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      content_hash TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      thumbnail_url TEXT,
      source_url TEXT NOT NULL,
      published_at INTEGER,
      meets_criteria_flag INTEGER NOT NULL DEFAULT 0,
      criteria_result TEXT,
      metric_value TEXT,
      read_at INTEGER,
      raw_data TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_message_cards_hash_source
      ON message_cards(content_hash, source_id);
    CREATE INDEX IF NOT EXISTS idx_message_cards_sub_unread
      ON message_cards(subscription_id, read_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_message_cards_unread
      ON message_cards(read_at, created_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      subscription_id TEXT REFERENCES subscriptions(id) ON DELETE CASCADE,
      related_entity_type TEXT,
      related_entity_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sources_enabled_status
      ON sources(is_enabled, status);
    CREATE INDEX IF NOT EXISTS idx_notifications_sub
      ON notifications(subscription_id, is_read, created_at);

    CREATE TABLE IF NOT EXISTS rss_instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  console.log('[DB] Schema bootstrapped');
}

function seedPromptTemplates(db: ReturnType<typeof drizzle>) {
  for (const tpl of DEFAULT_PROMPT_TEMPLATES) {
    db.insert(schema.promptTemplates)
      .values({
        ...tpl,
        defaultContent: tpl.content,
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .run();
  }
  console.log('[DB] Prompt templates seeded');
}

function seedSearchProvider(db: ReturnType<typeof drizzle>) {
  db.insert(schema.searchProviderConfig)
    .values({
      id: 'default',
      provider: 'none',
      apiKey: '',
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .run();
}

function seedRssInstance(sqlite: InstanceType<typeof Database>) {
  const existing = sqlite.prepare('SELECT id FROM rss_instances WHERE is_active = 1').get();
  if (existing) return; // already have an active instance
  const now = Date.now();
  const id = 'default-rsshub';
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO rss_instances (id, name, base_url, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`
    )
    .run(id, 'RssHub', 'https://rsshub.app', now, now);
}
