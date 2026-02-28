import type { CollectedItem } from '@/lib/sandbox/contract';
import type { LLMCallInfo } from '@/lib/ai/client';

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
  /** Step2 LLM 调用记录，持久化到 DB 以便重入向导时恢复 */
  step2LlmCalls?: LLMCallInfo[];
  /** 托管管道的错误消息，用于在向导中显示失败原因 */
  managedError?: string | null;
}
