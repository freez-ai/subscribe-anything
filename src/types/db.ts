import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  llmProviders,
  promptTemplates,
  searchProviderConfig,
  subscriptions,
  sources,
  messageCards,
  notifications,
  favorites,
} from '@/lib/db/schema';

export type LLMProvider = InferSelectModel<typeof llmProviders>;
export type NewLLMProvider = InferInsertModel<typeof llmProviders>;

export type PromptTemplate = InferSelectModel<typeof promptTemplates>;
export type NewPromptTemplate = InferInsertModel<typeof promptTemplates>;

export type SearchProviderConfig = InferSelectModel<typeof searchProviderConfig>;

export type Subscription = InferSelectModel<typeof subscriptions>;
export type NewSubscription = InferInsertModel<typeof subscriptions>;

export type Source = InferSelectModel<typeof sources>;
export type NewSource = InferInsertModel<typeof sources>;

export type MessageCard = InferSelectModel<typeof messageCards>;
export type NewMessageCard = InferInsertModel<typeof messageCards>;

export type Notification = InferSelectModel<typeof notifications>;
export type NewNotification = InferInsertModel<typeof notifications>;

export type Favorite = InferSelectModel<typeof favorites>;
export type NewFavorite = InferInsertModel<typeof favorites>;
