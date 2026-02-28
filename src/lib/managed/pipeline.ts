/**
 * Managed subscription creation pipeline.
 *
 * Runs asynchronously (fire-and-forget) after creating a placeholder subscription.
 * Phases:
 *   1. find_sources  — call findSourcesAgent (only if startStep === 'find_sources')
 *   2. generate_script — call generateScriptAgent for each selected source
 *   3. complete      — call createSourcesForSubscription, mark subscription active
 */

import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, managedBuildLogs } from '@/lib/db/schema';
import { createSourcesForSubscription } from '@/lib/subscriptionCreator';
import { createId } from '@paralleldrive/cuid2';
import pLimit from 'p-limit';
import { upsertLLMCall } from './llmCallStore';
import type { FoundSource, GeneratedSource } from '@/types/wizard';

// In-memory set of "subscriptionId:sourceUrl" keys that have been manually aborted.
export const abortedSourceKeys = new Set<string>();

/**
 * Abort a specific source generation: add to abortedSourceKeys and write an error log.
 * The background task may still be running its current LLM call, but will be ignored on next
 * checkpoint; the error log causes the frontend SSE to show the source as failed immediately.
 */
export function abortSource(subscriptionId: string, sourceUrl: string): void {
  abortedSourceKeys.add(`${subscriptionId}:${sourceUrl}`);
  writeLog(subscriptionId, 'generate_script', 'error', '已手动中断', { sourceUrl });
}

export type ManagedStartStep = 'find_sources' | 'generate_scripts' | 'complete';

export interface ManagedPayload {
  topic: string;
  criteria?: string;
  startStep: ManagedStartStep;
  userId: string;
  foundSources?: FoundSource[];
  generatedSources?: GeneratedSource[];
}

type LogLevel = 'info' | 'progress' | 'success' | 'error';
type LogStep = 'find_sources' | 'generate_script' | 'complete';

export function writeLog(
  subscriptionId: string,
  step: LogStep,
  level: LogLevel,
  message: string,
  payload?: unknown
) {
  try {
    const db = getDb();
    db.insert(managedBuildLogs)
      .values({
        id: createId(),
        subscriptionId,
        step,
        level,
        message,
        payload: payload !== undefined ? JSON.stringify(payload) : null,
        createdAt: new Date(),
      })
      .run();
  } catch (err) {
    // Silently ignore foreign key constraint errors — subscription was deleted
    if (err && typeof err === 'object' && 'code' in err && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return;
    }
    console.error('[managed pipeline] Failed to write log:', err);
  }
}

function isCancelled(subscriptionId: string): boolean {
  try {
    const db = getDb();
    const row = db
      .select({ managedStatus: subscriptions.managedStatus })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .get();
    return !row || row.managedStatus !== 'managed_creating';
  } catch {
    return true;
  }
}

// ── Exported step functions (no isCancelled checks — run to completion) ──────

/**
 * Run the find_sources step for a subscription.
 * Writes logs to DB; runs to completion unless subscription is deleted.
 */
export async function runFindSourcesStep(
  subscriptionId: string,
  topic: string,
  criteria: string | undefined,
  userId: string
): Promise<void> {
  writeLog(subscriptionId, 'find_sources', 'info', '开始发现数据源...');

  try {
    const { findSourcesAgent } = await import('@/lib/ai/agents/findSourcesAgent');

    const discovered = await findSourcesAgent(
      { topic, criteria },
      (event: unknown) => {
        const e = event as Record<string, unknown>;
        if (e.type === 'tool_call' && e.name === 'webSearch') {
          const args = e.args as { query: string };
          writeLog(subscriptionId, 'find_sources', 'progress', `搜索：${args.query}`);
        }
      },
      (info) => upsertLLMCall(subscriptionId, info),
      userId
    );

    // Auto-select up to 5 sources (prefer recommended) so managed takeover can restore correctly
    const selected = autoSelectSources(discovered);
    writeLog(subscriptionId, 'find_sources', 'success', `发现 ${discovered.length} 个数据源，已自动选择 ${selected.length} 个`, selected);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeLog(subscriptionId, 'find_sources', 'error', `发现数据源失败：${msg}`);
  }
}

/**
 * Run the generate_scripts step for a subscription.
 * Skips sources that already have a success log.
 * Runs all sources in parallel (up to 5 concurrent).
 * Writes logs to DB; runs to completion unless subscription is deleted or source is aborted.
 */
export async function runGenerateScriptsStep(
  subscriptionId: string,
  sources: FoundSource[],
  criteria: string | undefined,
  userId: string
): Promise<void> {
  if (sources.length === 0) {
    writeLog(subscriptionId, 'generate_script', 'error', '没有可用的数据源，跳过脚本生成');
    return;
  }

  writeLog(subscriptionId, 'generate_script', 'info', `开始为 ${sources.length} 个数据源生成脚本...`);

  // Check which sources already have success logs (for resume scenarios)
  const completedUrls = getCompletedSourceUrls(subscriptionId);

  const { generateScriptAgent } = await import('@/lib/ai/agents/generateScriptAgent');
  const limit = pLimit(5);

  const tasks = sources
    .filter((source) => !completedUrls.has(source.url))
    .map((source) =>
      limit(async () => {
        const abortKey = `${subscriptionId}:${source.url}`;
        if (abortedSourceKeys.has(abortKey)) return;

        writeLog(subscriptionId, 'generate_script', 'info', `正在为 "${source.title}" 生成脚本...`, { sourceUrl: source.url });

        try {
          const result = await generateScriptAgent(
            {
              title: source.title,
              url: source.url,
              description: source.description,
              criteria,
            },
            (msg: string) => {
              if (abortedSourceKeys.has(abortKey)) return;
              writeLog(subscriptionId, 'generate_script', 'progress', `[${source.title}] ${msg}`, { sourceUrl: source.url });
            },
            (info) => upsertLLMCall(subscriptionId, { ...info, sourceUrl: source.url }),
            userId
          );

          // If aborted while agent was running, don't overwrite the abort error log
          if (abortedSourceKeys.has(abortKey)) return;

          if (result.success && result.script) {
            writeLog(
              subscriptionId,
              'generate_script',
              'success',
              `"${source.title}" 脚本生成成功，采集到 ${result.initialItems?.length ?? 0} 条数据`,
              {
                sourceUrl: source.url,
                script: result.script,
                cronExpression: result.cronExpression,
                initialItems: result.initialItems ?? [],
              }
            );
          } else if (result.sandboxUnavailable && result.script) {
            writeLog(
              subscriptionId,
              'generate_script',
              'success',
              `"${source.title}" 脚本已生成（未验证）`,
              {
                sourceUrl: source.url,
                script: result.script,
                cronExpression: result.cronExpression,
                initialItems: [],
                unverified: true,
              }
            );
          } else {
            writeLog(subscriptionId, 'generate_script', 'error', `"${source.title}" 脚本生成失败：${result.error ?? '未知错误'}`, { sourceUrl: source.url });
          }
        } catch (err) {
          if (abortedSourceKeys.has(abortKey)) return;
          const msg = err instanceof Error ? err.message : String(err);
          writeLog(subscriptionId, 'generate_script', 'error', `"${source.title}" 脚本生成出错：${msg}`, { sourceUrl: source.url });
        }
      })
    );

  await Promise.all(tasks);
}

/**
 * Retry generating a single source script.
 * Clears old logs for this sourceUrl before starting.
 */
export async function retryGenerateSourceStep(
  subscriptionId: string,
  source: FoundSource,
  criteria: string | undefined,
  userId: string,
  userPrompt?: string
): Promise<void> {
  writeLog(subscriptionId, 'generate_script', 'info', `正在为 "${source.title}" 重新生成脚本...`, { sourceUrl: source.url });

  try {
    const { generateScriptAgent } = await import('@/lib/ai/agents/generateScriptAgent');

    const result = await generateScriptAgent(
      {
        title: source.title,
        url: source.url,
        description: source.description,
        criteria,
        userPrompt: userPrompt?.trim() || undefined,
      },
      (msg: string) => {
        writeLog(subscriptionId, 'generate_script', 'progress', `[${source.title}] ${msg}`, { sourceUrl: source.url });
      },
      (info) => upsertLLMCall(subscriptionId, { ...info, sourceUrl: source.url }),
      userId
    );

    if (result.success && result.script) {
      writeLog(
        subscriptionId,
        'generate_script',
        'success',
        `"${source.title}" 脚本生成成功，采集到 ${result.initialItems?.length ?? 0} 条数据`,
        {
          sourceUrl: source.url,
          script: result.script,
          cronExpression: result.cronExpression,
          initialItems: result.initialItems ?? [],
        }
      );
    } else if (result.sandboxUnavailable && result.script) {
      writeLog(
        subscriptionId,
        'generate_script',
        'success',
        `"${source.title}" 脚本已生成（未验证）`,
        {
          sourceUrl: source.url,
          script: result.script,
          cronExpression: result.cronExpression,
          initialItems: [],
          unverified: true,
        }
      );
    } else {
      writeLog(subscriptionId, 'generate_script', 'error', `"${source.title}" 脚本生成失败：${result.error ?? '未知错误'}`, { sourceUrl: source.url });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeLog(subscriptionId, 'generate_script', 'error', `"${source.title}" 脚本生成出错：${msg}`, { sourceUrl: source.url });
  }
}

/** Delete all generate_script logs for a specific sourceUrl */
export function deleteSourceLogs(subscriptionId: string, sourceUrl: string): void {
  try {
    const db = getDb();
    const allLogs = db
      .select({ id: managedBuildLogs.id, payload: managedBuildLogs.payload })
      .from(managedBuildLogs)
      .where(
        and(
          eq(managedBuildLogs.subscriptionId, subscriptionId),
          eq(managedBuildLogs.step, 'generate_script')
        )
      )
      .all();

    const idsToDelete = allLogs
      .filter((l) => {
        if (!l.payload) return false;
        try {
          const p = JSON.parse(l.payload) as { sourceUrl?: string };
          return p.sourceUrl === sourceUrl;
        } catch {
          return false;
        }
      })
      .map((l) => l.id);

    if (idsToDelete.length > 0) {
      db.delete(managedBuildLogs)
        .where(inArray(managedBuildLogs.id, idsToDelete))
        .run();
    }
  } catch (err) {
    console.error('[managed pipeline] Failed to delete source logs:', err);
  }
}

function getCompletedSourceUrls(subscriptionId: string): Set<string> {
  try {
    const db = getDb();
    const logs = db
      .select({ payload: managedBuildLogs.payload })
      .from(managedBuildLogs)
      .where(
        and(
          eq(managedBuildLogs.subscriptionId, subscriptionId),
          eq(managedBuildLogs.step, 'generate_script'),
          eq(managedBuildLogs.level, 'success')
        )
      )
      .all();

    return new Set(
      logs
        .map((l) => {
          if (!l.payload) return null;
          try {
            const p = JSON.parse(l.payload) as { sourceUrl?: string };
            return p.sourceUrl ?? null;
          } catch {
            return null;
          }
        })
        .filter((u): u is string => u !== null)
    );
  } catch {
    return new Set();
  }
}

// ── Full managed pipeline (used by "后台托管创建" button) ─────────────────────

/**
 * Wait for an already-running find_sources step to complete.
 * Returns discovered sources (from success log payload) or null on error/timeout/cancel.
 */
async function waitForFindSourcesResult(
  subscriptionId: string,
  isCancelledFn: () => boolean,
  maxWaitMs = 5 * 60 * 1000
): Promise<FoundSource[] | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (isCancelledFn()) return null;
    const db = getDb();
    const successLog = db
      .select({ payload: managedBuildLogs.payload })
      .from(managedBuildLogs)
      .where(
        and(
          eq(managedBuildLogs.subscriptionId, subscriptionId),
          eq(managedBuildLogs.step, 'find_sources'),
          eq(managedBuildLogs.level, 'success')
        )
      )
      .get();
    if (successLog?.payload) {
      try {
        const s = JSON.parse(successLog.payload);
        if (Array.isArray(s)) return s as FoundSource[];
      } catch { /* ignore */ }
    }
    const errorLog = db
      .select({ id: managedBuildLogs.id })
      .from(managedBuildLogs)
      .where(
        and(
          eq(managedBuildLogs.subscriptionId, subscriptionId),
          eq(managedBuildLogs.step, 'find_sources'),
          eq(managedBuildLogs.level, 'error')
        )
      )
      .get();
    if (errorLog) return null;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

/** Auto-select up to 5 sources: prefer recommended, fall back to all */
function autoSelectSources(discovered: FoundSource[]): FoundSource[] {
  const recommended = discovered.filter((s) => s.recommended);
  const notRecommended = discovered.filter((s) => !s.recommended);
  if (recommended.length >= 5) return recommended.slice(0, 5);
  return [...recommended, ...notRecommended.slice(0, 5 - recommended.length)];
}

export async function runManagedPipeline(
  subscriptionId: string,
  payload: ManagedPayload
): Promise<void> {
  const { topic, criteria, startStep, userId, foundSources: initialFoundSources, generatedSources: initialGeneratedSources } = payload;

  try {
    let foundSources: FoundSource[] = initialFoundSources ?? [];
    let generatedSources: GeneratedSource[] = initialGeneratedSources ?? [];

    // ── Phase 1: find_sources ─────────────────────────────────────────────────
    if (startStep === 'find_sources') {
      if (isCancelled(subscriptionId)) return;

      // Check if find_sources already has results in DB (another task may be running or done)
      const db = getDb();
      const existingSuccess = db
        .select({ payload: managedBuildLogs.payload })
        .from(managedBuildLogs)
        .where(
          and(
            eq(managedBuildLogs.subscriptionId, subscriptionId),
            eq(managedBuildLogs.step, 'find_sources'),
            eq(managedBuildLogs.level, 'success')
          )
        )
        .get();

      if (existingSuccess?.payload) {
        // Already completed — reuse results
        try {
          const discovered = JSON.parse(existingSuccess.payload) as FoundSource[];
          if (Array.isArray(discovered)) {
            const selected = autoSelectSources(discovered);
            foundSources = selected;
            writeLog(subscriptionId, 'find_sources', 'info', `已自动选择 ${selected.length} 个数据源（复用已有结果）`);
          }
        } catch { /* ignore, will fall through to fresh run */ }
      } else {
        // Check if a find_sources task is already in progress
        const existingInfo = db
          .select({ id: managedBuildLogs.id })
          .from(managedBuildLogs)
          .where(
            and(
              eq(managedBuildLogs.subscriptionId, subscriptionId),
              eq(managedBuildLogs.step, 'find_sources'),
              eq(managedBuildLogs.level, 'info')
            )
          )
          .get();

        if (existingInfo) {
          // Task is in progress — wait for it to finish
          writeLog(subscriptionId, 'find_sources', 'info', '等待数据源发现任务完成...');
          const discovered = await waitForFindSourcesResult(subscriptionId, () => isCancelled(subscriptionId));
          if (!discovered || isCancelled(subscriptionId)) {
            markFailed(subscriptionId, '发现数据源失败或超时');
            return;
          }
          const selected = autoSelectSources(discovered);
          foundSources = selected;
          writeLog(subscriptionId, 'find_sources', 'info', `已自动选择 ${selected.length} 个数据源`);
        } else {
          // No existing task — run from scratch
          writeLog(subscriptionId, 'find_sources', 'info', '开始发现数据源...');

          try {
            const { findSourcesAgent } = await import('@/lib/ai/agents/findSourcesAgent');

            const discovered = await findSourcesAgent(
              { topic, criteria },
              (event: unknown) => {
                if (isCancelled(subscriptionId)) return;
                const e = event as Record<string, unknown>;
                if (e.type === 'tool_call' && e.name === 'webSearch') {
                  const args = e.args as { query: string };
                  writeLog(subscriptionId, 'find_sources', 'progress', `搜索：${args.query}`);
                }
              },
              (info) => upsertLLMCall(subscriptionId, info),
              userId
            );

            const selected = autoSelectSources(discovered);
            foundSources = selected;

            // Always write sources log — even if cancelled (watch mode needs to see results)
            // Log the selected sources (max 5) so takeover can restore correctly
            writeLog(subscriptionId, 'find_sources', 'success', `发现 ${discovered.length} 个数据源，已自动选择 ${selected.length} 个`, selected);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            writeLog(subscriptionId, 'find_sources', 'error', `发现数据源失败：${msg}`);
            markFailed(subscriptionId, `发现数据源失败：${msg}`);
            return;
          }
        }
      }
    }

    // ── Phase 2: generate_scripts ─────────────────────────────────────────────
    if (startStep !== 'complete') {
      if (isCancelled(subscriptionId)) return;

      const sourcesToProcess = foundSources.length > 0 ? foundSources : (initialFoundSources ?? []);

      // Skip sources already provided in initialGeneratedSources (wizard handoff)
      const alreadyDoneUrls = new Set((initialGeneratedSources ?? []).map((s) => s.url));
      // Seed generatedSources with already-completed ones so phase 3 can create them
      for (const done of (initialGeneratedSources ?? [])) {
        if (!generatedSources.some((gs) => gs.url === done.url)) {
          generatedSources.push(done);
        }
      }

      if (sourcesToProcess.length === 0) {
        writeLog(subscriptionId, 'generate_script', 'error', '没有可用的数据源，跳过脚本生成');
      } else {
        const pendingSources = sourcesToProcess.filter((s) => !alreadyDoneUrls.has(s.url));
        if (pendingSources.length > 0) {
          writeLog(subscriptionId, 'generate_script', 'info', `开始为 ${pendingSources.length} 个数据源生成脚本...`);
        }

        const { generateScriptAgent } = await import('@/lib/ai/agents/generateScriptAgent');
        const limit = pLimit(5);

        const pipelineTasks = sourcesToProcess
          .filter((source) => !alreadyDoneUrls.has(source.url))
          .map((source) =>
            limit(async () => {
              if (isCancelled(subscriptionId)) return;

              writeLog(subscriptionId, 'generate_script', 'info', `正在为 "${source.title}" 生成脚本...`, { sourceUrl: source.url });

              try {
                const result = await generateScriptAgent(
                  {
                    title: source.title,
                    url: source.url,
                    description: source.description,
                    criteria,
                  },
                  (msg: string) => {
                    if (isCancelled(subscriptionId)) return;
                    writeLog(subscriptionId, 'generate_script', 'progress', `[${source.title}] ${msg}`, { sourceUrl: source.url });
                  },
                  (info) => upsertLLMCall(subscriptionId, { ...info, sourceUrl: source.url }),
                  userId
                );

                if (isCancelled(subscriptionId)) return;

                if (result.success && result.script) {
                  const genSource: GeneratedSource = {
                    title: source.title,
                    url: source.url,
                    description: source.description,
                    script: result.script,
                    cronExpression: result.cronExpression ?? '0 * * * *',
                    initialItems: result.initialItems ?? [],
                    isEnabled: true,
                  };
                  generatedSources.push(genSource);
                  writeLog(
                    subscriptionId,
                    'generate_script',
                    'success',
                    `"${source.title}" 脚本生成成功，采集到 ${result.initialItems?.length ?? 0} 条数据`,
                    { sourceUrl: source.url, script: result.script, cronExpression: result.cronExpression, initialItems: result.initialItems ?? [] }
                  );
                } else if (result.sandboxUnavailable && result.script) {
                  const genSource: GeneratedSource = {
                    title: source.title,
                    url: source.url,
                    description: source.description,
                    script: result.script,
                    cronExpression: result.cronExpression ?? '0 * * * *',
                    initialItems: [],
                    isEnabled: true,
                  };
                  generatedSources.push(genSource);
                  writeLog(subscriptionId, 'generate_script', 'success', `"${source.title}" 脚本已生成（未验证）`, {
                    sourceUrl: source.url,
                    script: result.script,
                    cronExpression: result.cronExpression,
                    initialItems: [],
                    unverified: true,
                  });
                } else {
                  writeLog(subscriptionId, 'generate_script', 'error', `"${source.title}" 脚本生成失败：${result.error ?? '未知错误'}`, { sourceUrl: source.url });
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                writeLog(subscriptionId, 'generate_script', 'error', `"${source.title}" 脚本生成出错：${msg}`, { sourceUrl: source.url });
              }
            })
          );

        await Promise.all(pipelineTasks);
      }
    }

    // ── Phase 3: complete ─────────────────────────────────────────────────────
    if (isCancelled(subscriptionId)) return;

    const sourcesToCreate = generatedSources.length > 0 ? generatedSources : (initialGeneratedSources ?? []);

    if (sourcesToCreate.length === 0) {
      writeLog(subscriptionId, 'complete', 'error', '没有成功生成的脚本，创建失败');
      markFailed(subscriptionId, '没有成功生成的脚本');
      return;
    }

    writeLog(subscriptionId, 'complete', 'info', `正在创建 ${sourcesToCreate.length} 个订阅源...`);

    await createSourcesForSubscription(subscriptionId, sourcesToCreate, criteria);

    // Mark subscription as active
    const db = getDb();
    db.update(subscriptions)
      .set({
        managedStatus: null,
        managedError: null,
        wizardStateJson: null,
        isEnabled: true,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscriptionId))
      .run();

    writeLog(subscriptionId, 'complete', 'success', `订阅创建完成，共 ${sourcesToCreate.length} 个数据源`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[managed pipeline] Unexpected error:', err);
    markFailed(subscriptionId, msg);
  }
}

function markFailed(subscriptionId: string, error: string) {
  try {
    const db = getDb();
    db.update(subscriptions)
      .set({
        managedStatus: 'failed',
        managedError: error,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscriptionId))
      .run();
  } catch (err) {
    console.error('[managed pipeline] Failed to mark as failed:', err);
  }
}
