import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

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
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── prompt_templates ────────────────────────────────────────────────────────
export const promptTemplates = sqliteTable('prompt_templates', {
  id: text('id').primaryKey(), // e.g. 'find-sources'
  name: text('name').notNull(),
  description: text('description').notNull(),
  content: text('content').notNull(),
  defaultContent: text('default_content').notNull(),
  // Optional: pin this template to a specific provider; null = use default active provider
  providerId: text('provider_id').references(() => llmProviders.id, { onDelete: 'set null' }),
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
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── subscriptions ───────────────────────────────────────────────────────────
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  topic: text('topic').notNull(),
  criteria: text('criteria'), // optional monitoring criteria
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  unreadCount: integer('unread_count').notNull().default(0),
  totalCount: integer('total_count').notNull().default(0),
  lastUpdatedAt: integer('last_updated_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
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
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Relations ───────────────────────────────────────────────────────────────
export const subscriptionsRelations = relations(subscriptions, ({ many }) => ({
  sources: many(sources),
  messageCards: many(messageCards),
  notifications: many(notifications),
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
