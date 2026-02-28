import type { CollectedItem } from '@/lib/sandbox/contract';

export interface FoundSource {
  title: string;
  url: string;
  description: string;
  recommended?: boolean;
  /** true = source can provide metric data for the monitoring criteria */
  canProvideCriteria?: boolean;
}

export interface GeneratedSource {
  title: string;
  url: string;
  description: string;
  script: string;
  cronExpression: string;
  initialItems: CollectedItem[];
  isEnabled: boolean;
}

export interface WizardState {
  step: 1 | 2 | 3 | 4;
  topic: string;
  criteria: string;
  foundSources: FoundSource[];
  selectedIndices: number[];
  generatedSources: GeneratedSource[];
  subscriptionId?: string; // Step1 完成后写入，用于后续步骤的 DB 持久化
  watchingManagedId?: string; // 监听模式：接管 find_sources 时设置，Step2 轮询此订阅的日志
}
