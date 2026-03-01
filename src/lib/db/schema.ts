import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// ─── users ───────────────────────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  googleId: text('google_id').unique(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  isGuest: integer('is_guest', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── sessions ────────────────────────────────────────────────────────────────
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── oauth_states ────────────────────────────────────────────────────────────
export const oauthStates = sqliteTable('oauth_states', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  provider: text('provider', { enum: ['google'] }).notNull(),
  state: text('state').notNull(),
  redirectUrl: text('redirect_url'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
});

// ─── llm_providers ───────────────────────────────────────────────────────────
export const llmProviders = sqliteTable('llm_providers', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key').notNull(),
  modelId: text('model_id').notNull(),
  headers: text('headers'), // JSON string, optional extra headers
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  totalTokensUsed: integer('total_tokens_used').notNull().default(0),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── prompt_templates ────────────────────────────────────────────────────────
export const promptTemplates = sqliteTable('prompt_templates', {
  id: text('id').primaryKey(), // e.g. 'userId-find-sources'
  name: text('name').notNull(),
  description: text('description').notNull(),
  content: text('content').notNull(),
  defaultContent: text('default_content').notNull(),
  // Optional: pin this template to a specific provider; null = use default active provider
  providerId: text('provider_id').references(() => llmProviders.id, { onDelete: 'set null' }),
  // User-specific templates; null for system defaults (migration only)
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── search_provider_config ──────────────────────────────────────────────────
export const searchProviderConfig = sqliteTable('search_provider_config', {
  id: text('id').primaryKey().default('default'),
  provider: text('provider', { enum: ['tavily', 'serper', 'none'] })
    .notNull()
    .default('none'),
  apiKey: text('api_key').notNull().default(''),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── subscriptions ───────────────────────────────────────────────────────────
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  topic: text('topic').notNull(),
  criteria: text('criteria'), // optional monitoring criteria
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  unreadCount: integer('unread_count').notNull().default(0),
  totalCount: integer('total_count').notNull().default(0),
  lastUpdatedAt: integer('last_updated_at', { mode: 'timestamp_ms' }),
  // 创建状态：null = 正常订阅，'manual_creating' = 手动创建中，'managed_creating' = 托管创建中，'failed' = 创建失败
  managedStatus: text('managed_status', {
    enum: ['manual_creating', 'managed_creating', 'failed'],
  }),
  managedError: text('managed_error'),
  // 存储向导中间状态，用于恢复；手动和托管均使用
  wizardStateJson: text('wizard_state_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── managed_build_logs ──────────────────────────────────────────────────────
export const managedBuildLogs = sqliteTable('managed_build_logs', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  subscriptionId: text('subscription_id')
    .notNull()
    .references(() => subscriptions.id, { onDelete: 'cascade' }),
  step: text('step', { enum: ['find_sources', 'generate_script', 'complete'] }).notNull(),
  level: text('level', { enum: ['info', 'progress', 'success', 'error'] }).notNull(),
  message: text('message').notNull(),
  payload: text('payload'), // JSON：关键步骤结果（foundSources 列表、脚本等）
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── sources ─────────────────────────────────────────────────────────────────
export const sources = sqliteTable('sources', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  subscriptionId: text('subscription_id')
    .notNull()
    .references(() => subscriptions.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  url: text('url').notNull(),
  script: text('script').notNull().default(''),
  cronExpression: text('cron_expression').notNull().default('0 * * * *'),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  status: text('status', { enum: ['active', 'failed', 'disabled', 'pending'] })
    .notNull()
    .default('pending'),
  lastRunAt: integer('last_run_at', { mode: 'timestamp_ms' }),
  lastRunSuccess: integer('last_run_success', { mode: 'boolean' }),
  lastError: text('last_error'),
  nextRunAt: integer('next_run_at', { mode: 'timestamp_ms' }),
  totalRuns: integer('total_runs').notNull().default(0),
  successRuns: integer('success_runs').notNull().default(0),
  itemsCollected: integer('items_collected').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── favorites ───────────────────────────────────────────────────────────────
// Independent table storing copies of favorited cards
export const favorites = sqliteTable('favorites', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Original card reference (may be null if original card deleted)
  originalCardId: text('original_card_id'),
  // Copied card data
  title: text('title').notNull(),
  summary: text('summary'),
  thumbnailUrl: text('thumbnail_url'),
  sourceUrl: text('source_url').notNull(),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
  meetsCriteriaFlag: integer('meets_criteria_flag', { mode: 'boolean' })
    .notNull()
    .default(false),
  criteriaResult: text('criteria_result').$type<'matched' | 'not_matched' | 'invalid'>(),
  metricValue: text('metric_value'),
  // Source info snapshot
  subscriptionTopic: text('subscription_topic'),
  sourceTitle: text('source_title'),
  // Favorite metadata
  favoriteAt: integer('favorite_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  // Soft-delete flag: false means unfavorited (hidden but kept for undo)
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(true),
});

// ─── message_cards ───────────────────────────────────────────────────────────
export const messageCards = sqliteTable('message_cards', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  subscriptionId: text('subscription_id')
    .notNull()
    .references(() => subscriptions.id, { onDelete: 'cascade' }),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' }),
  contentHash: text('content_hash').notNull(), // sha256(title + url)
  title: text('title').notNull(),
  summary: text('summary'),
  thumbnailUrl: text('thumbnail_url'),
  sourceUrl: text('source_url').notNull(),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
  meetsCriteriaFlag: integer('meets_criteria_flag', { mode: 'boolean' })
    .notNull()
    .default(false),
  criteriaResult: text('criteria_result').$type<'matched' | 'not_matched' | 'invalid'>(),
  metricValue: text('metric_value'), // raw extracted value, e.g. "¥299"
  readAt: integer('read_at', { mode: 'timestamp_ms' }), // null = unread
  rawData: text('raw_data'), // JSON string
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── notifications ───────────────────────────────────────────────────────────
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  type: text('type', {
    enum: ['source_created', 'source_fixed', 'source_failed', 'cards_collected'],
  }).notNull(),
  title: text('title').notNull(),
  body: text('body'),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  subscriptionId: text('subscription_id').references(() => subscriptions.id, {
    onDelete: 'cascade',
  }),
  relatedEntityType: text('related_entity_type'), // 'source'
  relatedEntityId: text('related_entity_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── rss_instances ───────────────────────────────────────────────────────────
export const rssInstances = sqliteTable('rss_instances', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── oauth_config ─────────────────────────────────────────────────────────────
export const oauthConfig = sqliteTable('oauth_config', {
  id: text('id').primaryKey().default('google'), // one row per provider
  clientId: text('client_id').notNull().default(''),
  clientSecret: text('client_secret').notNull().default(''),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Relations ───────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  subscriptions: many(subscriptions),
  favorites: many(favorites),
  promptTemplates: many(promptTemplates),
  sessions: many(sessions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  sources: many(sources),
  messageCards: many(messageCards),
  notifications: many(notifications),
  managedBuildLogs: many(managedBuildLogs),
}));

export const managedBuildLogsRelations = relations(managedBuildLogs, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [managedBuildLogs.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const sourcesRelations = relations(sources, ({ one, many }) => ({
  subscription: one(subscriptions, {
    fields: [sources.subscriptionId],
    references: [subscriptions.id],
  }),
  messageCards: many(messageCards),
}));

export const messageCardsRelations = relations(messageCards, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [messageCards.subscriptionId],
    references: [subscriptions.id],
  }),
  source: one(sources, {
    fields: [messageCards.sourceId],
    references: [sources.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [notifications.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
}));

export const promptTemplatesRelations = relations(promptTemplates, ({ one }) => ({
  user: one(users, {
    fields: [promptTemplates.userId],
    references: [users.id],
  }),
  provider: one(llmProviders, {
    fields: [promptTemplates.providerId],
    references: [llmProviders.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const llmProvidersRelations = relations(llmProviders, ({ one }) => ({
  creator: one(users, {
    fields: [llmProviders.createdBy],
    references: [users.id],
  }),
}));

export const rssInstancesRelations = relations(rssInstances, ({ one }) => ({
  creator: one(users, {
    fields: [rssInstances.createdBy],
    references: [users.id],
  }),
}));

// ─── email_verification_codes ────────────────────────────────────────────────
export const emailVerificationCodes = sqliteTable('email_verification_codes', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').notNull(),
  code: text('code').notNull(), // 6位数字验证码
  type: text('type', { enum: ['register'] }).notNull().default('register'),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp_ms' }), // null = 未使用
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── password_reset_tokens ───────────────────────────────────────────────────
export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(), // 重置令牌
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp_ms' }), // null = 未使用
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── smtp_config ─────────────────────────────────────────────────────────────
export const smtpConfig = sqliteTable('smtp_config', {
  id: text('id').primaryKey().default('default'),
  host: text('host').notNull(), // SMTP 服务器地址
  port: integer('port').notNull().default(465),
  secure: integer('secure', { mode: 'boolean' }).notNull().default(true), // SSL/TLS
  user: text('user').notNull(), // SMTP 用户名
  password: text('password').notNull(), // SMTP 密码/授权码
  fromEmail: text('from_email'), // 发件人地址
  fromName: text('from_name').default('Subscribe Anything'),
  requireVerification: integer('require_verification', { mode: 'boolean' }).notNull().default(true), // 注册是否需要邮箱验证码
  provider: text('provider').notNull().default('smtp'), // 'smtp' | 'zeabur' | 'resend'
  zeaburApiKey: text('zeabur_api_key'), // Zeabur Email API Key
  resendApiKey: text('resend_api_key'), // Resend API Key
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));
