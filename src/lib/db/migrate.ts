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
    content: `为主题"{{topic}}"（监控条件：{{criteria}}）找到 5-10 个高质量数据源。

**步骤**
1. webSearch：先确认实体的标准名称/别名，再搜索对应订阅源；优先选有规律更新、内容相关、可程序化抓取的来源

2. rssRadar：将所有域名**合并为一次**调用；queries 只传裸域名（如 bilibili.com），不传完整 URL 或用户 ID
   - 有匹配路由 → 将 \`:param\` 占位符填入已知参数，构造完整 RSS URL
   - 无匹配路由 → 保留原始网页 URL；禁止自行拼造 RSSHub 路径

3. checkFeed：将所有 RSS URL **合并为一次**调用，传 \`urls\`（RSS URL 列表）和 \`keywords\`（实体所有已知别名，共用）
   - \`valid: true\` → 保留
   - \`templateMismatch: true\` → 修正 URL 结构后重新验证
   - \`keywordFound: false\` → webSearch 找到正确实体 ID，重新构造后验证
   - 其他失败 → 同上修复；仍失败则回退为原始网页 URL；原始网页 URL 无需验证

**输出（JSON 数组）**
每项：\`title\`、\`url\`（有效 RSS 优先，否则网页 URL）、\`description\`（内容特点、更新频率、是否含监控指标）、\`recommended\`（质量高/更新频繁/RSS 有效 → true，否则 false）；监控条件不为"无"时加 \`canProvideCriteria\`（能否采集到监控所需指标）

最优质 2-4 个源标记 \`recommended: true\`。`,
    defaultContent: '',
  },
  {
    id: 'generate-script',
    name: '生成采集脚本',
    description: '引导智能体为特定数据源编写 JavaScript 采集脚本',
    content: `你是一位 JavaScript 数据采集专家，为以下数据源编写采集脚本。

数据源：{{title}}
URL：{{url}}
描述：{{description}}
监控条件：{{criteria}}

**沙箱环境（isolated-vm V8，非 Node.js / 非浏览器）**
- 脚本入口：\`async function collect(): Promise<CollectedItem[]>\`，可带 export 前缀
- 可用：\`fetch\`（最多 5 次，无 \`headers\` 属性）、\`URL\`、\`URLSearchParams\`、标准 JS
- 禁用：\`require\`/\`import\`、\`process\`/\`fs\`/\`Buffer\`、DOM API（DOMParser/document/window）、\`console\`、\`setTimeout\`、\`atob\`/\`btoa\`、\`TextDecoder\`/\`TextEncoder\`
- HTML 解析：只能用字符串方法或正则，不能用任何 DOM API

**返回字段**
- 必填：\`title\`（string）、\`url\`（string）
- 建议：\`publishedAt\`（ISO 8601，从数据源提取真实时间）、\`summary\`、\`thumbnailUrl\`
- 监控条件不为"无"时需加：\`criteriaResult\`（'matched'|'not_matched'|'invalid'）、\`metricValue\`
- 无数据返回 \`[]\`，禁止构造假数据兜底；所有 fetch URL 必须限于 \`{{domain}}\` 域名

**可用工具**
- \`webFetch(url)\`：获取页面/Feed 内容
- \`webFetchBrowser(url)\`：无头浏览器，捕获 XHR/Fetch 请求（适合 SPA 或被反爬页面）
- \`webSearch(query)\`：搜索 API 文档、实体 ID 等辅助信息
- \`rssRadar(queries)\`：查询现有 RSS 路由
- \`validateScript(script)\`：在沙箱中验证脚本（**必须调用**）

**工作流程**
1. 用 webFetch 抓取目标 URL，判断内容类型：
   - 含 \`<rss\`/\`<feed\`/\`<item\`/\`<entry\` → RSS/Atom，直接编写解析脚本
   - HTML 页面 → 调用 rssRadar；有匹配路由则将 templateUrl 中的 \`:param\` 占位符替换为真实参数，再用 webFetch 拉取完整 RSS XML 后编写解析脚本；无匹配则解析 HTML 或 API
   - 返回空/失败 → 改用 webFetchBrowser，优先分析 capturedRequests 中的 API 端点
2. RSS/XML 解析：用 split/indexOf/slice 逐块提取字段；**禁止对 XML 标签用正则**；务必 webFetch 实际内容确认 XML 结构后再写脚本
3. 脚本写好后调用 validateScript；失败则修复重试（最多 3 次），有 suggestedScript 时优先验证它

**注意（脚本以 JSON 字符串传输，以下两类写法会导致语法报错）**
- 正则中匹配字面 \`/\` 时用字符类 \`[/]\` 代替 \`\\/\`
- 字符串字面量中需要换行时写 \`\\n\` 转义，不要使用真实换行符`,
    defaultContent: '',
  },
  {
    id: 'validate-script',
    name: '校验采集脚本',
    description: '对采集脚本和采集结果进行 LLM 质量审查，验证数据真实性，可同时修复发现的问题',
    content: `对以下采集脚本进行质量审查。

数据源：{{url}}
描述：{{description}}
监控条件：{{criteria}}

脚本：
\`\`\`javascript
{{script}}
\`\`\`

采集结果（前 5 条）：
\`\`\`json
{{items}}
\`\`\`

**审查步骤**
1. 代码质量：有无假数据兜底？publishedAt 建议提取但非必须，不提取不算质量问题；fetch URL 是否限于数据源域名？监控条件不为"无"时是否正确实现 \`criteriaResult\`/\`metricValue\`？
2. 数据真实性：用 webFetch 抓取前 2 条 URL，确认可访问且页面内容与 title 吻合；因网络限制无法访问时结合代码质量综合判断

**输出**
\`\`\`json
{"valid": true, "reason": "简明说明（30字以内）"}
\`\`\`
valid=false 且可修复时，在 JSON 块后附完整修复脚本。`,
    defaultContent: '',
  },
  {
    id: 'repair-script',
    name: '修复采集脚本',
    description: '引导智能体诊断并修复失效的采集脚本',
    content: `以下采集脚本运行失败，请修复。

URL：{{url}}
错误：{{lastError}}

脚本：
\`\`\`javascript
{{script}}
\`\`\`

**沙箱环境（isolated-vm V8，非 Node.js / 非浏览器）**
可用：\`fetch\`（最多 5 次，无 \`headers\` 属性）、\`URL\`、\`URLSearchParams\`、标准 JS
禁用：\`require\`/\`import\`、\`process\`/\`fs\`/\`Buffer\`、DOM API、\`console\`、\`setTimeout\`、\`atob\`/\`btoa\`、\`TextDecoder\`/\`TextEncoder\`
HTML 解析：只能用字符串方法或正则

**步骤**
1. webFetch 重新抓取页面，分析当前结构；SPA 骨架则改用 webFetchBrowser，分析 capturedRequests 中的 API 端点
2. 结合错误信息定位问题并修复；无数据返回 \`[]\`，禁止构造假数据兜底
3. validateScript 验证，失败则重试（最多 3 次）

**注意（脚本以 JSON 字符串传输，以下两类写法会导致语法报错）**
- 正则中匹配字面 \`/\` 时用字符类 \`[/]\` 代替 \`\\/\`
- 字符串字面量中需要换行时写 \`\\n\` 转义，不要使用真实换行符`,
    defaultContent: '',
  },
  {
    id: 'analyze-subscription',
    name: '分析订阅数据',
    description: '引导智能体对订阅的消息卡片进行综合分析，生成 HTML 报告',
    content: `对订阅主题"{{topic}}"的 {{count}} 条内容进行分析。

分析需求：{{analysisRequest}}

数据（JSON，含 url 字段）：
{{data}}

生成完整 HTML 报告，包含：执行摘要、内容趋势、值得关注的条目（用 \`<a href="url" target="_blank">\` 链接原文）、结论与建议。

格式：语义化 HTML + 内嵌 CSS；仅输出 HTML，不要加 \`\`\`html 代码块标记。`,
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
  // Favorites table (for message card favorites feature)
  try {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      original_card_id TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      thumbnail_url TEXT,
      source_url TEXT NOT NULL,
      published_at INTEGER,
      meets_criteria_flag INTEGER NOT NULL DEFAULT 0,
      criteria_result TEXT,
      metric_value TEXT,
      subscription_topic TEXT,
      source_title TEXT,
      favorite_at INTEGER NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 1
    )`);
  } catch { /* already exists */ }

  // === Multi-tenant user system migration ===
  migrateUserSystem(sqlite);

  // === Email verification system migration ===
  migrateEmailVerification(sqlite);

  // === Google OAuth config migration ===
  migrateOAuthConfig(sqlite);

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

  // === Managed subscription creation migration ===
  migrateManagedCreation(sqlite);

  // Repair: older migrations incorrectly set user_id on base system templates.
  // Base templates must always have user_id = NULL so the cleanup DELETE below ignores them.
  try {
    sqlite
      .prepare(
        `UPDATE prompt_templates SET user_id = NULL
           WHERE id IN ('find-sources','generate-script','validate-script','repair-script','analyze-subscription')
             AND user_id IS NOT NULL`
      )
      .run();
  } catch { /* ignore if user_id column doesn't exist yet */ }

  // Clean up duplicate user templates created by the old eager-copy bug.
  // Valid user templates have id = `${user_id}-${baseId}`.
  // Any user template whose id doesn't match this pattern is stale and should be removed.
  try {
    sqlite
      .prepare(
        `DELETE FROM prompt_templates
         WHERE user_id IS NOT NULL
           AND id != user_id || '-find-sources'
           AND id != user_id || '-generate-script'
           AND id != user_id || '-validate-script'
           AND id != user_id || '-repair-script'
           AND id != user_id || '-analyze-subscription'`
      )
      .run();
  } catch { /* ignore if user_id column doesn't exist yet */ }

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
      cron_expression TEXT NOT NULL DEFAULT '0 * * * *',
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

    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      original_card_id TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      thumbnail_url TEXT,
      source_url TEXT NOT NULL,
      published_at INTEGER,
      meets_criteria_flag INTEGER NOT NULL DEFAULT 0,
      criteria_result TEXT,
      metric_value TEXT,
      subscription_topic TEXT,
      source_title TEXT,
      favorite_at INTEGER NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 1
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

function migrateOAuthConfig(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS oauth_config (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL DEFAULT '',
      client_secret TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )
  `);
  console.log('[DB] OAuth config migration complete');
}
export const GUEST_USER_ID = 'guest-user';

function migrateUserSystem(sqlite: InstanceType<typeof Database>) {
  const now = Date.now();

  // 1. Create users table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      name TEXT,
      avatar_url TEXT,
      google_id TEXT UNIQUE,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_guest INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // 2. Create sessions table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // 3. Create oauth_states table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      state TEXT NOT NULL,
      redirect_url TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);

  // 4. Add userId columns to user-level tables (nullable first, then we'll backfill)
  try { sqlite.exec('ALTER TABLE subscriptions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE favorites ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE prompt_templates ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE'); } catch { /* already exists */ }

  // 5. Add createdBy columns to global config tables
  try { sqlite.exec('ALTER TABLE llm_providers ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE search_provider_config ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE rss_instances ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL'); } catch { /* already exists */ }

  // 6. Create indexes
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_templates_user ON prompt_templates(user_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);

  // 7. Create/ensure guest user exists
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO users (id, is_guest, is_admin, created_at, updated_at)
       VALUES (?, 1, 0, ?, ?)`
    )
    .run(GUEST_USER_ID, now, now);

  // 8. Migrate existing data to guest user (only if not already migrated)
  sqlite.prepare(`UPDATE subscriptions SET user_id = ? WHERE user_id IS NULL`).run(GUEST_USER_ID);
  sqlite.prepare(`UPDATE favorites SET user_id = ? WHERE user_id IS NULL`).run(GUEST_USER_ID);
  // prompt_templates: only user-specific (non-base) templates become guest user's templates.
  // Base system templates ('find-sources' etc.) must keep user_id = NULL so the cleanup
  // DELETE below does not mistake them for stale user copies and delete them.
  sqlite
    .prepare(
      `UPDATE prompt_templates SET user_id = ? WHERE user_id IS NULL
         AND id NOT IN ('find-sources','generate-script','validate-script','repair-script','analyze-subscription')`
    )
    .run(GUEST_USER_ID);

  console.log('[DB] User system migration complete');
}

function migrateEmailVerification(sqlite: InstanceType<typeof Database>) {
  // Create email_verification_codes table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'register',
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  // Create index for faster lookups
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email_type ON email_verification_codes(email, type)`);

  // Create smtp_config table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS smtp_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 465,
      secure INTEGER NOT NULL DEFAULT 1,
      user TEXT NOT NULL,
      password TEXT NOT NULL,
      from_email TEXT,
      from_name TEXT DEFAULT 'Subscribe Anything',
      require_verification INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    )
  `);

  // Idempotent column additions for existing databases
  try { sqlite.exec('ALTER TABLE smtp_config ADD COLUMN require_verification INTEGER NOT NULL DEFAULT 1'); } catch { /* already exists */ }
  try { sqlite.exec("ALTER TABLE smtp_config ADD COLUMN provider TEXT NOT NULL DEFAULT 'smtp'"); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE smtp_config ADD COLUMN zeabur_api_key TEXT'); } catch { /* already exists */ }

  console.log('[DB] Email verification system migration complete');
}

function migrateManagedCreation(sqlite: InstanceType<typeof Database>) {
  // Add managed creation fields to subscriptions table
  try { sqlite.exec('ALTER TABLE subscriptions ADD COLUMN managed_status TEXT'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE subscriptions ADD COLUMN managed_error TEXT'); } catch { /* already exists */ }
  try { sqlite.exec('ALTER TABLE subscriptions ADD COLUMN wizard_state_json TEXT'); } catch { /* already exists */ }

  // Create managed_build_logs table
  try {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS managed_build_logs (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      step TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      payload TEXT,
      created_at INTEGER NOT NULL
    )`);
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_managed_logs_sub ON managed_build_logs(subscription_id, created_at)');
  } catch { /* already exists */ }

  // 进程重启：托管创建中断的标记为失败
  sqlite.prepare(
    `UPDATE subscriptions SET managed_status='failed', managed_error='服务器重启，创建中断'
     WHERE managed_status = 'managed_creating'`
  ).run();

  console.log('[DB] Managed creation migration complete');
}
