'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Eye,
  Loader2,
  Play,
  RotateCcw,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import LLMLogDialog from '@/components/debug/LLMLogDialog';
import { ItemPreviewDialog } from '@/components/wizard/ItemPreviewDialog';
import type { LLMCallInfo } from '@/lib/ai/client';
import type { CollectedItem } from '@/lib/sandbox/contract';
import type { GeneratedSource, WizardState } from '@/types/wizard';

interface Step3ScriptGenProps {
  state: WizardState;
  onStateChange: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  onManagedCreate?: (generatedSources: GeneratedSource[]) => void;
  onDiscard?: () => void;
}

type SourceStatus =
  | { status: 'skipped' }
  | { status: 'pending' }
  | { status: 'generating'; message?: string }
  | { status: 'success'; script: string; cronExpression: string; items: CollectedItem[]; unverified?: boolean }
  | { status: 'failed'; error: string };

function isInProgress(s: SourceStatus | undefined): boolean {
  return !!s && (s.status === 'pending' || s.status === 'generating');
}

function isTerminal(s: SourceStatus | undefined): boolean {
  return !!s && (s.status === 'success' || s.status === 'failed' || s.status === 'skipped');
}

interface LogEntry {
  type: 'log';
  id: string;
  step: string;
  level: string;
  message: string;
  payload: { sourceUrl?: string; script?: string; cronExpression?: string; initialItems?: CollectedItem[]; unverified?: boolean } | null;
}

export default function Step3ScriptGen({ state, onStateChange, onNext, onBack, onManagedCreate, onDiscard }: Step3ScriptGenProps) {
  const allSources = state.foundSources;
  const selectedSet = new Set(state.selectedIndices);

  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>(
    () => allSources.map((source, i) => {
      // Pre-populate from state.generatedSources (takeover)
      const preGen = state.generatedSources.find((s) => s.url === source.url);
      if (preGen) {
        return {
          status: 'success' as const,
          script: preGen.script,
          cronExpression: preGen.cronExpression,
          items: preGen.initialItems,
        };
      }
      return selectedSet.has(i) ? { status: 'pending' as const } : { status: 'skipped' as const };
    })
  );

  const [userPromptInputs, setUserPromptInputs] = useState<Record<number, string>>({});
  const [retryExpanded, setRetryExpanded] = useState<Set<number>>(new Set());
  const [llmCalls, setLLMCalls] = useState<LLMCallInfo[]>([]);
  // Track which source's LLM log dialog is open (globalIdx), null = none
  const [llmLogOpenFor, setLLMLogOpenFor] = useState<number | null>(null);
  const [previewSourceIdx, setPreviewSourceIdx] = useState<number | null>(null);
  // Track sources manually aborted — SSE success/error events for these will be ignored
  const abortedIndicesRef = useRef(new Set<number>());
  const abortRef = useRef<AbortController | null>(null);
  const resetSourcesRef = useRef(new Set<string>());

  // Poll for LLM calls while subscriptionId is available
  useEffect(() => {
    if (!state.subscriptionId) return;
    const subId = state.subscriptionId;
    const poll = () => {
      fetch(`/api/subscriptions/${subId}/llm-calls`)
        .then((r) => r.json())
        .then((data: { calls?: LLMCallInfo[] }) => {
          if (data.calls) setLLMCalls(data.calls);
        })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [state.subscriptionId]);

  const updateStatus = useCallback((globalIdx: number, update: SourceStatus) => {
    setSourceStatuses((prev) => {
      const next = [...prev];
      next[globalIdx] = update;
      return next;
    });
  }, []);

  const connectSSE = useCallback(() => {
    const subscriptionId = state.subscriptionId;
    if (!subscriptionId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const res = await fetch(`/api/subscriptions/${subscriptionId}/stream-progress`, {
          signal: controller.signal,
        });
        if (!res.ok) return;

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as LogEntry | { type: 'done' };
              if (event.type === 'done') return;
              if (event.type !== 'log' || event.step !== 'generate_script') continue;

              const logEvent = event as LogEntry;
              const sourceUrl = logEvent.payload?.sourceUrl;
              if (!sourceUrl) continue;

              const globalIdx = allSources.findIndex((s) => s.url === sourceUrl);
              if (globalIdx < 0) continue;

              // Ignore events for sources that were manually aborted
              if (abortedIndicesRef.current.has(globalIdx)) continue;

              if (logEvent.level === 'info' || logEvent.level === 'progress') {
                setSourceStatuses((prev) => {
                  const current = prev[globalIdx];
                  if (current?.status === 'pending' || current?.status === 'generating') {
                    const next = [...prev];
                    next[globalIdx] = { status: 'generating', message: logEvent.message };
                    return next;
                  }
                  return prev;
                });
              } else if (logEvent.level === 'success' && logEvent.payload?.script) {
                const p = logEvent.payload;
                updateStatus(globalIdx, {
                  status: 'success',
                  script: p.script!,
                  cronExpression: p.cronExpression ?? '0 * * * *',
                  items: p.initialItems ?? [],
                  unverified: p.unverified,
                });
              } else if (logEvent.level === 'error') {
                setSourceStatuses((prev) => {
                  const current = prev[globalIdx];
                  if (current?.status === 'pending' || current?.status === 'generating') {
                    const next = [...prev];
                    next[globalIdx] = { status: 'failed', error: logEvent.message };
                    return next;
                  }
                  return prev;
                });
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // On error, mark all pending/generating sources as failed
        setSourceStatuses((prev) =>
          prev.map((s) =>
            s.status === 'pending' || s.status === 'generating'
              ? { status: 'failed', error: '连接中断' }
              : s
          )
        );
      }
    })();
  }, [state.subscriptionId, allSources, updateStatus]);

  useEffect(() => {
    if (state.subscriptionId) {
      connectSSE();
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────────
  const anyInProgress = sourceStatuses.some(isInProgress);
  const allSelectedTerminated = state.selectedIndices.every((i) => isTerminal(sourceStatuses[i]));
  const allSelectedFailed =
    allSelectedTerminated &&
    state.selectedIndices.length > 0 &&
    state.selectedIndices.every((i) => sourceStatuses[i]?.status === 'failed');

  const successSources = allSources.reduce<GeneratedSource[]>((acc, source, globalIdx) => {
    const s = sourceStatuses[globalIdx];
    if (s?.status === 'success') {
      acc.push({
        title: source.title,
        url: source.url,
        description: source.description,
        script: s.script,
        cronExpression: s.cronExpression,
        initialItems: s.items,
        isEnabled: true,
      });
    }
    return acc;
  }, []);

  const hasSuccess = successSources.length > 0;

  const handleRetrySource = async (globalIdx: number) => {
    const source = allSources[globalIdx];
    if (!source || !state.subscriptionId) return;

    // Remove from aborted set so SSE events are no longer blocked
    abortedIndicesRef.current.delete(globalIdx);
    updateStatus(globalIdx, { status: 'pending' });
    setRetryExpanded((prev) => {
      const next = new Set(prev);
      next.delete(globalIdx);
      return next;
    });
    resetSourcesRef.current.add(source.url);

    await fetch(`/api/subscriptions/${state.subscriptionId}/retry-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: source.url,
        sourceTitle: source.title,
        sourceDescription: source.description,
        userPrompt: userPromptInputs[globalIdx]?.trim() || undefined,
      }),
    }).catch(() => {});
  };

  // Start generation for a skipped source (no user prompt required)
  const handleStartGeneration = async (globalIdx: number) => {
    const source = allSources[globalIdx];
    if (!source || !state.subscriptionId) return;

    abortedIndicesRef.current.delete(globalIdx);
    updateStatus(globalIdx, { status: 'pending' });

    await fetch(`/api/subscriptions/${state.subscriptionId}/retry-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: source.url,
        sourceTitle: source.title,
        sourceDescription: source.description,
      }),
    }).catch(() => {});
  };

  // Abort a currently in-progress source
  const handleAbortSource = async (globalIdx: number) => {
    const source = allSources[globalIdx];
    if (!source || !state.subscriptionId) return;

    // Mark locally as aborted immediately
    abortedIndicesRef.current.add(globalIdx);
    updateStatus(globalIdx, { status: 'failed', error: '已手动中断' });

    await fetch(`/api/subscriptions/${state.subscriptionId}/abort-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: source.url }),
    }).catch(() => {});
  };

  const retryAllFailed = () => {
    state.selectedIndices
      .filter((i) => sourceStatuses[i]?.status === 'failed')
      .forEach((i) => handleRetrySource(i));
  };

  const handleNext = () => {
    onStateChange({ generatedSources: successSources });
    onNext();
  };

  // ── Per-source LLM calls ──────────────────────────────────────────────────
  const getSourceLLMCalls = (sourceUrl: string) =>
    llmCalls.filter((c) => c.sourceUrl === sourceUrl);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 pt-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">生成采集脚本</h2>
        <p className="text-sm text-muted-foreground">
          AI 正在为已选数据源并行生成并验证采集脚本，未选中的数据源可手动开始
        </p>
      </div>

      <ScrollArea className="h-[52vh] md:h-[48vh]">
        <div className="flex flex-col gap-3 pr-2">
          {allSources.map((source, globalIdx) => {
            const s = sourceStatuses[globalIdx] ?? { status: 'skipped' as const };
            const inProgress = isInProgress(s);
            const expanded = retryExpanded.has(globalIdx);
            const sourceLLMCalls = getSourceLLMCalls(source.url);
            const sourceTotalTokens = sourceLLMCalls.reduce((sum, c) => sum + (c.usage?.total ?? 0), 0);

            return (
              <Card
                key={globalIdx}
                className={`overflow-hidden${s.status === 'skipped' ? ' opacity-60' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {s.status === 'skipped' && (
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/40" />
                      )}
                      {inProgress && (
                        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                      )}
                      {s.status === 'success' && !s.unverified && (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      )}
                      {s.status === 'success' && s.unverified && (
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      )}
                      {s.status === 'failed' && (
                        <XCircle className="h-5 w-5 text-destructive" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{source.title}</p>
                      <p className="text-xs text-muted-foreground truncate mb-1">{source.url}</p>

                      {s.status === 'skipped' && (
                        <p className="text-xs text-muted-foreground">未选中，跳过生成</p>
                      )}
                      {s.status === 'pending' && (
                        <p className="text-xs text-muted-foreground">正在初始化...</p>
                      )}
                      {s.status === 'generating' && (
                        <p className="text-xs text-muted-foreground">
                          {s.message ?? '正在生成脚本...'}
                        </p>
                      )}
                      {s.status === 'success' && !s.unverified && (
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                            脚本验证通过
                          </span>
                          {s.items.length > 0 && (
                            <>
                              <span className="text-xs text-muted-foreground">
                                采集到 {s.items.length} 条内容
                              </span>
                              <button
                                onClick={() => setPreviewSourceIdx(globalIdx)}
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
                              >
                                <Eye className="h-3 w-3" />
                                预览
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {s.status === 'success' && s.unverified && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                          脚本已生成（沙箱不可用，未验证）
                        </p>
                      )}
                      {s.status === 'failed' && (
                        <p className="text-xs text-destructive mt-1 break-words">{s.error}</p>
                      )}

                      {/* Per-source action buttons */}
                      <div className="mt-2 flex flex-wrap items-start gap-2">
                        {/* Per-source LLM log button */}
                        {(s.status === 'failed' || s.status === 'success' || sourceLLMCalls.length > 0) && (
                          <button
                            onClick={() =>
                              setLLMLogOpenFor((prev) =>
                                prev === globalIdx ? null : globalIdx
                              )
                            }
                            className="inline-flex items-center gap-1 text-xs h-7 px-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            title="查看该数据源的 LLM 调用日志"
                          >
                            <BrainCircuit className="h-3 w-3" />
                            LLM调用日志
                          </button>
                        )}

                        {/* Start generation button (skipped sources) */}
                        {s.status === 'skipped' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleStartGeneration(globalIdx)}
                          >
                            <Play className="h-3 w-3 mr-1" />开始生成
                          </Button>
                        )}

                        {/* Abort button (in-progress sources) */}
                        {inProgress && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleAbortSource(globalIdx)}
                          >
                            <Square className="h-3 w-3 mr-1" />中断
                          </Button>
                        )}

                        {/* Retry button (failed) */}
                        {s.status === 'failed' && !expanded && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                              setRetryExpanded((prev) => new Set([...prev, globalIdx]))
                            }
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />重试
                          </Button>
                        )}

                        {/* Expanded retry panel */}
                        {expanded && (
                          <div className="w-full flex flex-col gap-2">
                            <Textarea
                              placeholder="可选：对 AI 的补充说明（如：请使用 webFetchBrowser 工具；数据通过 /api/list 接口加载）"
                              value={userPromptInputs[globalIdx] ?? ''}
                              onChange={(e) =>
                                setUserPromptInputs((prev) => ({
                                  ...prev,
                                  [globalIdx]: e.target.value,
                                }))
                              }
                              rows={2}
                              className="text-xs"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-7 px-3 text-xs"
                                onClick={() => handleRetrySource(globalIdx)}
                              >
                                开始生成
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() =>
                                  setRetryExpanded((prev) => {
                                    const next = new Set(prev);
                                    next.delete(globalIdx);
                                    return next;
                                  })
                                }
                              >
                                取消
                              </Button>
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* All-failed banner */}
      {allSelectedFailed && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
          <span>所有已选数据源的脚本生成均失败</span>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/50 hover:bg-destructive/10 flex-shrink-0"
            onClick={retryAllFailed}
          >
            重试全部
          </Button>
        </div>
      )}

      {/* Bottom bar */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t md:static md:border-t-0 md:bg-transparent md:p-0 md:mt-2">
        <div className="flex gap-3">
          <Button
            onClick={handleNext}
            disabled={anyInProgress || !allSelectedTerminated || !hasSuccess}
            className="flex-1 md:flex-none"
          >
            {anyInProgress
              ? '生成中...'
              : hasSuccess
                ? `下一步（${successSources.length} 个源就绪）`
                : '下一步'}
          </Button>
          {hasSuccess && onManagedCreate && (
            <Button
              variant="outline"
              onClick={() => {
                abortRef.current?.abort();
                onManagedCreate(successSources);
              }}
              className="flex-none text-amber-600 border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50"
              title={anyInProgress
                ? '中止当前生成，将已完成的源交给后台完成'
                : '跳过确认步骤，在后台直接创建订阅'}
            >
              <Bot className="h-4 w-4 mr-1.5" />
              帮我完成
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onBack}
            className="flex-none"
          >
            暂存退出
          </Button>
          {onDiscard && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDiscard}
              className="flex-none text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="丢弃此次订阅创建"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Per-source LLM Log Dialog */}
      {llmLogOpenFor !== null && (() => {
        const source = allSources[llmLogOpenFor];
        if (!source) return null;
        const calls = getSourceLLMCalls(source.url);
        const totalTokens = calls.reduce((sum, c) => sum + (c.usage?.total ?? 0), 0);
        return (
          <LLMLogDialog
            sourceTitle={source.title}
            calls={calls}
            totalTokens={totalTokens}
            onClose={() => setLLMLogOpenFor(null)}
          />
        );
      })()}

      {/* Item preview dialog */}
      {previewSourceIdx !== null && (() => {
        const source = allSources[previewSourceIdx];
        const s = sourceStatuses[previewSourceIdx];
        if (!source || !s || s.status !== 'success') return null;
        return (
          <ItemPreviewDialog
            title={source.title}
            items={s.items}
            onClose={() => setPreviewSourceIdx(null)}
          />
        );
      })()}
    </div>
  );
}
