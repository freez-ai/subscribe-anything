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
使用 webSearch 工具搜索互联网，找到 5-10 个高质量的数据源。每个数据源应该：
1. 有规律地更新内容
2. 内容与主题高度相关
3. 可以通过程序化方式抓取（有 RSS、API 或稳定的 HTML 结构）

**第二步：对每个找到的网站调用 rssRadar 检查 RSS 路由**
无论是什么网站，都必须调用 rssRadar 工具查询其域名或网站名称，因为 rssRadar 几乎没有调用成本，而且很多网站都有现成的 RSS 路由。
- 若 rssRadar 返回了匹配路由，templateUrl 中包含 :param 占位符，根据上下文（如数据源 URL 中的 ID、用户名等）推断实际参数值并替换，将替换后的完整 URL 作为该源的 url 字段
- **若 rssRadar 没有找到匹配路由，保留原始网页 URL，严禁自行拼造 RSSHub 路径（如 /zhihu/search/xxx、/bilibili/topic/xxx 等）** — 只有 rssRadar 返回的 templateUrl 才是真实存在的路由
- 若 rssRadar 返回了路由但 templateUrl 参数无法从上下文直接推断（如需要用户 ID 但只有用户名），必须先调用 webSearch 搜索确认正确参数，再填入 templateUrl

**第三步：验证并修复每个 RSS URL 的可访问性**
对第二步中生成的每个 RSS URL，使用 webFetch 验证是否返回有效内容（HTTP 200 且响应包含 \`<rss\`、\`<feed\`、\`<item\` 或 \`<entry\` 等 XML 标志）：
- 若验证通过 → 保留该 URL
- 若返回 4xx / 5xx 或内容不是有效 XML → **执行修复，不要直接输出失败 URL**：
  1. 用 webSearch 搜索数据源主题和平台（如 "知乎 黑白调X7 专栏 ID"、"B站 用户名 UID" 等），找到正确的实体标识
  2. 用找到的实体标识重新填入 rssRadar 返回的 templateUrl，再次 webFetch 验证
  3. 若修复后仍失败，回退到使用原始网页 URL（非 RSS）
- 原始网页 URL（非 RSS 类型）无需 webFetch 验证

最终以 JSON 数组格式输出，每项包含：
- title: 数据源名称
- url: 数据源 URL（若有对应 RSS 路由则使用填好参数的 RSS 地址，否则使用原始页面 URL）
- description: 简短说明（该源的内容特点和更新频率，以及是否包含监控指标数据；若已找到 RSS 路由请注明路由名称）
- recommended: 布尔值，true 表示该源质量高、更新频率好、抓取难度低（有 RSS 路由的源抓取难度低，优先标记为 true），特别推荐订阅；false 表示可订阅但质量或可访问性一般
- canProvideCriteria: 布尔值（仅当监控条件不为"无"时填写）。true 表示该数据源页面中可以抓取到用于评估监控条件所需的指标数据（如价格、数量、评分等）；false 表示无法从该源获取相关指标。若监控条件为"无"，此字段可省略

注意：若监控条件不为"无"，canProvideCriteria=false 的数据源不应被标记为 recommended=true。
请综合考虑内容质量、更新频率、抓取难度，将其中最优质的 2-4 个源标记为 recommended: true。`,
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

【执行环境 — isolated-vm V8 沙箱（非 Node.js，非浏览器）】
脚本格式：定义 async function collect() 返回 CollectedItem[]；可带 export 前缀，运行时自动去除。

可用 API：
• fetch(url, opts?) → { ok, status, statusText, text(), json() }
  每次运行最多调用 5 次；单次响应上限 5 MB；不支持请求 body；不提供 res.headers
• URL（含 searchParams）、URLSearchParams
• 标准 JS：JSON、Array、Object、String、Number、RegExp、Promise、async/await、Map、Set、Date、Math

严禁使用（会直接报错终止运行）：
require() / import — 无模块系统
process、fs、Buffer、child_process、path — 无 Node.js 内置模块
DOMParser、document、window — 无浏览器 DOM
console — 无效（沙箱内无输出管道）
setTimeout / setInterval、atob / btoa、TextDecoder / TextEncoder

HTML 解析：必须用正则表达式或字符串方法，不能使用任何 DOM API。

脚本要求：
1. 每个 CollectedItem 必须包含 title（字符串）和 url（字符串）
2. publishedAt（ISO 8601 字符串，精确到秒）—— **必须尽力提取每条内容的真实发布时间**：
   - RSS/Atom：从 pubDate / published / dc:date / updated 字段解析，用 new Date(pub).toISOString() 转换
   - HTML/API：从 <time> 标签、datetime 属性、JSON 字段（publishedAt / created_at / date 等）、meta 标签中提取
   - 若只能获取到日期字符串（如 "2024-01-15"）：直接 new Date("2024-01-15").toISOString() 得到 "2024-01-15T00:00:00.000Z"
   - 若数据源确实不提供任何时间信息，省略此字段（服务端会自动用采集时间兜底）
3. 可选字段：summary、thumbnailUrl
4. 若页面无数据或解析失败，直接返回空数组 []；严禁构造虚假兜底条目（如 items.push({ title: '...', url: sourceUrl }) 之类的 fallback）
5. 【域名约束】脚本中所有 fetch 调用的 URL 必须限制在 **{{domain}}** 域名范围内，禁止访问其他第三方网站
6. 【监控条件处理】若监控条件不为"无"，则：
   - 分析监控条件，确定需要提取的指标（如价格、数量、评分等）
   - 为每个 CollectedItem 增加以下字段：
     - criteriaResult: 'matched' | 'not_matched' | 'invalid'
       · 'matched'：成功提取到指标且满足监控条件
       · 'not_matched'：成功提取到指标但不满足条件
       · 'invalid'：无法从该条目提取到指标数据
     - metricValue: string（可选）：提取到的原始指标值，用于展示，如 "¥299"、"1,234 stars"
   - 若整个数据源结构无法提供监控指标，所有条目均设 criteriaResult: 'invalid'

先按以下步骤确定最佳采集方式：

**第一步：检查是否有可用的 RSS feed**
使用 rssRadar 工具查询数据源网站名称或域名，看是否存在匹配的 RSS 路由。
- rssRadar 返回的 templateUrl 包含 :param 占位符（如 /bilibili/user/video/:uid），需根据数据源 URL 或上下文推断实际参数值并替换
- 若找到路由，使用 webFetch 工具直接抓取填好参数的 RSS URL，查看原始 XML 内容，确认包含 <item> 或 <entry> 条目
- 若 feed 有效：**优先编写基于 RSS 的采集脚本**。
  RSS/XML 解析必须用 **split + indexOf/slice 字符串方法**，禁止对 XML 标签使用正则表达式（正则在沙箱中处理含 / 的闭合标签极易出错）。
  标准 RSS 解析模板（直接套用，不要改成正则）：
  \`\`\`javascript
  export async function collect() {
    const res = await fetch('RSS_URL_HERE');
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const blocks = xml.split('<item>').slice(1);
    for (const block of blocks) {
      const end = block.indexOf('</item>');
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
      const url   = pick('link') || pick('guid');
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
  Atom feed 同理，将 \`<item>\` 替换为 \`<entry>\`，\`<link>\` 替换为从 \`<link href="..."\` 中提取 href。
- 若 rssRadar 无匹配路由或 webFetch 返回的内容不是有效 XML feed：继续第二步

**第二步：检查原始页面结构**
使用 webFetch 工具获取页面内容，判断页面类型：
- 若 HTML 包含实际数据（文章列表、商品信息等）→ 根据 HTML 结构编写采集脚本
- 若 HTML 仅为 SPA 骨架（如仅有 \`<div id="app">\` / \`<div id="root">\`、内容极少）→ 改用 webFetchBrowser 工具，它会用无头浏览器渲染页面并捕获 JSON API 请求；若 capturedRequests 不为空，优先分析其中的 API 端点和响应结构，直接用 fetch 调用该 API 编写采集脚本（无需解析 HTML，在沙箱中同样有效）
写好后使用 validateScript 工具验证（验证流程：沙箱执行 → 确认采集到 ≥1 条数据 → LLM 质量审查 + 抓取采集 URL 真实性）。
如验证失败则根据错误信息修复并重试（最多 3 次）；若验证结果中包含 suggestedScript 字段，请优先使用该脚本重新调用 validateScript 验证。

【重要 — 正则表达式中的斜杠（仅 HTML 解析时适用，RSS 解析用上方模板不涉及此问题）】脚本以 JSON 字符串传输，JSON 会将 \\/ 反序列化为 /，导致正则提前闭合、后续字符被误读为 flag，出现 "Invalid regular expression flags" 语法错误。
解决方案：在正则表达式中需要匹配字面 / 时，用字符类 [/] 替代 \\/。
示例：匹配 </a> 应写 /[<][/]a>/ 而非 /<\\/a>/。`,
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
