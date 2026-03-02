import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sources } from '@/lib/db/schema';
import { repairScriptAgent } from '@/lib/ai/agents/repairScriptAgent';
import { createNotification } from '@/lib/notifications';
import type { LLMCallInfo } from '@/lib/ai/client';

/* ── Types ── */
export interface RepairMessage {
  type: 'start' | 'progress' | 'llm_call' | 'success' | 'failed' | 'done';
  [key: string]: unknown;
}

type Emit = (data: RepairMessage) => void;

interface RepairTask {
  status: 'running' | 'success' | 'failed';
  messages: RepairMessage[];
  listeners: Set<Emit>;
  startedAt: number;
}

/* ── In-memory store ── */
const tasks = new Map<string, RepairTask>();

/** Cleanup completed tasks after 5 minutes */
function scheduleCleanup(sourceId: string) {
  setTimeout(() => {
    const task = tasks.get(sourceId);
    if (task && task.status !== 'running') {
      tasks.delete(sourceId);
    }
  }, 5 * 60 * 1000);
}

/** Broadcast a message to all SSE listeners and store it */
function broadcast(task: RepairTask, msg: RepairMessage) {
  task.messages.push(msg);
  for (const listener of task.listeners) {
    try { listener(msg); } catch { /* listener may be gone */ }
  }
}

/* ── Public API ── */

/** Check if a repair is already running for this source */
export function isRepairing(sourceId: string): boolean {
  const task = tasks.get(sourceId);
  return !!task && task.status === 'running';
}

/** Get the current task (running or recently completed) */
export function getRepairTask(sourceId: string): RepairTask | undefined {
  return tasks.get(sourceId);
}

/** Start a background repair. Returns false if already running. */
export function startRepair(
  sourceId: string,
  source: { title: string; url: string; script: string; lastError: string | null; subscriptionId: string },
  userId: string,
): boolean {
  if (isRepairing(sourceId)) return false;

  const task: RepairTask = {
    status: 'running',
    messages: [],
    listeners: new Set(),
    startedAt: Date.now(),
  };
  tasks.set(sourceId, task);

  // Fire-and-forget — run in background
  runRepair(sourceId, source, userId, task).catch((err) => {
    console.error('[RepairManager] unexpected error', err);
  });

  return true;
}

/* ── Internal ── */

async function runRepair(
  sourceId: string,
  source: { title: string; url: string; script: string; lastError: string | null; subscriptionId: string },
  userId: string,
  task: RepairTask,
) {
  const db = getDb();

  broadcast(task, { type: 'start', sourceId, sourceTitle: source.title });

  try {
    const agentResult = await repairScriptAgent(
      {
        url: source.url,
        script: source.script,
        lastError: source.lastError ?? '未知错误',
      },
      (message) => broadcast(task, { type: 'progress', message }),
      (info: LLMCallInfo) => broadcast(task, { type: 'llm_call', ...info }),
      userId,
    );

    if (agentResult.success && agentResult.script) {
      // Auto-apply: update source script + status
      db.update(sources)
        .set({ script: agentResult.script, status: 'active', lastError: null })
        .where(eq(sources.id, sourceId))
        .run();

      broadcast(task, { type: 'success', script: agentResult.script });
      task.status = 'success';

      createNotification(db, {
        type: 'source_fixed',
        title: `订阅源修复成功：${source.title}`,
        subscriptionId: source.subscriptionId,
        relatedEntityType: 'source',
        relatedEntityId: sourceId,
      });
    } else {
      const reason = agentResult.reason ?? '未知原因';
      broadcast(task, { type: 'failed', reason, script: agentResult.script });
      task.status = 'failed';

      createNotification(db, {
        type: 'source_failed',
        title: `订阅源修复失败：${source.title}`,
        body: reason,
        subscriptionId: source.subscriptionId,
        relatedEntityType: 'source',
        relatedEntityId: sourceId,
      });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    broadcast(task, { type: 'failed', reason });
    task.status = 'failed';

    createNotification(db, {
      type: 'source_failed',
      title: `订阅源修复失败：${source.title}`,
      body: reason,
      subscriptionId: source.subscriptionId,
      relatedEntityType: 'source',
      relatedEntityId: sourceId,
    });
  }

  broadcast(task, { type: 'done' });
  scheduleCleanup(sourceId);
}
