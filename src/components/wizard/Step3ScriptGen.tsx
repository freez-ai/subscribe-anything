'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  Play,
  RotateCcw,
  ScrollText,
  Square,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import LLMLogDialog from '@/components/debug/LLMLogDialog';
import type { LLMCallInfo } from '@/lib/ai/client';
import type { CollectedItem } from '@/lib/sandbox/contract';
import type { GeneratedSource, WizardState } from '@/types/wizard';

interface Step3ScriptGenProps {
  state: WizardState;
  onStateChange: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  onManagedCreate?: (generatedSources: GeneratedSource[]) => void;
}

type SourceStatus =
  | { status: 'skipped' }
  | { status: 'pending' }
  | { status: 'generating'; message?: string }
  | { status: 'validating'; message?: string }
  | { status: 'success'; script: string; cronExpression: string; items: CollectedItem[] }
  | { status: 'unverified'; script: string; cronExpression: string }
  | { status: 'failed'; error: string };

function isInProgress(s: SourceStatus | undefined): boolean {
  return !!s && (s.status === 'pending' || s.status === 'generating' || s.status === 'validating');
}

export default function Step3ScriptGen({ state, onStateChange, onNext, onBack, onManagedCreate }: Step3ScriptGenProps) {
  const allSources = state.foundSources;
  const selectedSet = new Set(state.selectedIndices);

  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>(
    () => allSources.map((_, i) =>
      selectedSet.has(i) ? { status: 'pending' as const } : { status: 'skipped' as const }
    )
  );
  const [sourceLLMCalls, setSourceLLMCalls] = useState<LLMCallInfo[][]>(
    () => allSources.map(() => [])
  );
  const [sourceTokens, setSourceTokens] = useState<number[]>(
    () => allSources.map(() => 0)
  );
  const [userPromptInputs, setUserPromptInputs] = useState<Record<number, string>>({});
  const [retryExpanded, setRetryExpanded] = useState<Set<number>>(new Set());
  const [logTarget, setLogTarget] = useState<{ idx: number; title: string } | null>(null);

  const abortRefs = useRef<Map<number, AbortController>>(new Map());
  const countedCallsRef = useRef<Map<number, Set<number>>>(new Map());

  const updateStatus = useCallback((globalIdx: number, update: SourceStatus) => {
    setSourceStatuses((prev) => {
      const next = [...prev];
      next[globalIdx] = update;
      return next;
    });
  }, []);

  const handleSourceEvent = useCallback(
    (globalIdx: number, event: Record<string, unknown>) => {
      const evStatus = event.status as string;

      if (evStatus === 'llm_call') {
        const info = event.llmCall as LLMCallInfo;
        setSourceLLMCalls((prev) => {
          const next = [...prev];
          const calls = next[globalIdx] ?? [];
          const existingIdx = calls.findIndex((c) => c.callIndex === info.callIndex);
          next[globalIdx] =
            existingIdx >= 0
              ? calls.map((c, i) => (i === existingIdx ? info : c))
              : [...calls, info];
          return next;
        });
        if (!info.streaming && info.usage?.total) {
          const counted = countedCallsRef.current.get(globalIdx) ?? new Set<number>();
          if (!counted.has(info.callIndex)) {
            counted.add(info.callIndex);
            countedCallsRef.current.set(globalIdx, counted);
            setSourceTokens((prev) => {
              const next = [...prev];
              next[globalIdx] = (next[globalIdx] ?? 0) + info.usage!.total;
              return next;
            });
          }
        }
        return;
      }

      if (evStatus === 'generating') {
        updateStatus(globalIdx, { status: 'generating', message: event.message as string | undefined });
      } else if (evStatus === 'validating') {
        updateStatus(globalIdx, { status: 'validating', message: event.message as string | undefined });
      } else if (evStatus === 'success') {
        updateStatus(globalIdx, {
          status: 'success',
          script: event.script as string,
          cronExpression: (event.cronExpression as string) || '0 * * * *',
          items: (event.items as CollectedItem[]) || [],
        });
      } else if (evStatus === 'unverified') {
        updateStatus(globalIdx, {
          status: 'unverified',
          script: event.script as string,
          cronExpression: (event.cronExpression as string) || '0 * * * *',
        });
      } else if (evStatus === 'failed') {
        updateStatus(globalIdx, {
          status: 'failed',
          error: (event.error as string) || '生成失败',
        });
      }
    },
    [updateStatus]
  );

  const abortSource = useCallback(
    (globalIdx: number) => {
      // Set terminal status first so the AbortError catch handler doesn't overwrite it
      updateStatus(globalIdx, { status: 'failed', error: '已中断' });
      const ctrl = abortRefs.current.get(globalIdx);
      abortRefs.current.delete(globalIdx);
      ctrl?.abort();
    },
    [updateStatus]
  );

  const generateSource = useCallback(
    async (globalIdx: number, userPrompt?: string) => {
      const source = allSources[globalIdx];
      if (!source) return;

      // Abort any prior stream for this source (superseded by this call)
      abortRefs.current.get(globalIdx)?.abort();
      const controller = new AbortController();
      abortRefs.current.set(globalIdx, controller);

      // Reset per-source tracking
      setSourceLLMCalls((prev) => { const next = [...prev]; next[globalIdx] = []; return next; });
      setSourceTokens((prev) => { const next = [...prev]; next[globalIdx] = 0; return next; });
      countedCallsRef.current.delete(globalIdx);
      // Close the retry panel for this source
      setRetryExpanded((prev) => { const next = new Set(prev); next.delete(globalIdx); return next; });
      updateStatus(globalIdx, { status: 'pending' });

      try {
        const res = await fetch('/api/wizard/generate-scripts', {
          method: 'POST',
          body: JSON.stringify({
            sources: [{
              title: source.title,
              url: source.url,
              description: source.description,
              userPrompt: userPrompt?.trim() || undefined,
            }],
            criteria: state.criteria || undefined,
          }),
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

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
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                // Single-source request: sourceIndex is always 0; map to globalIdx
                if (event.type === 'source_progress') {
                  handleSourceEvent(globalIdx, event);
                }
              } catch {
                // ignore malformed SSE events
              }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Either intentional abort (status already set by abortSource) or
          // superseded by a retry (new controller set — old result discarded).
          return;
        }
        // Only report failure if this controller is still the active one
        if (controller === abortRefs.current.get(globalIdx)) {
          updateStatus(globalIdx, {
            status: 'failed',
            error: err instanceof Error ? err.message : '连接失败',
          });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSources, state.criteria, handleSourceEvent, updateStatus]
  );

  // Auto-start all selected sources on mount
  useEffect(() => {
    state.selectedIndices.forEach((globalIdx) => generateSource(globalIdx));
    return () => {
      abortRefs.current.forEach((ctrl) => ctrl.abort());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────────
  const anyInProgress = sourceStatuses.some(isInProgress);
  const allSelectedTerminated = state.selectedIndices.every((i) => !isInProgress(sourceStatuses[i]));
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
    } else if (s?.status === 'unverified') {
      acc.push({
        title: source.title,
        url: source.url,
        description: source.description,
        script: s.script,
        cronExpression: s.cronExpression,
        initialItems: [],
        isEnabled: true,
      });
    }
    return acc;
  }, []);

  const hasSuccess = successSources.length > 0;

  const retryAllFailed = () => {
    state.selectedIndices
      .filter((i) => sourceStatuses[i]?.status === 'failed')
      .forEach((i) => generateSource(i));
  };

  const handleNext = () => {
    onStateChange({ generatedSources: successSources });
    onNext();
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 pt-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">生成采集脚本</h2>
        <p className="text-sm text-muted-foreground">
          AI 正在为已选数据源生成并验证采集脚本，未选中的数据源可手动开始
        </p>
      </div>

      <ScrollArea className="h-[52vh] md:h-[48vh]">
        <div className="flex flex-col gap-3 pr-2">
          {allSources.map((source, globalIdx) => {
            const s = sourceStatuses[globalIdx] ?? { status: 'skipped' as const };
            const inProgress = isInProgress(s);
            const expanded = retryExpanded.has(globalIdx);

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
                      {s.status === 'success' && (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      )}
                      {s.status === 'unverified' && (
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
                        <p className="text-xs text-muted-foreground">等待中...</p>
                      )}
                      {(s.status === 'generating' || s.status === 'validating') && (
                        <p className="text-xs text-muted-foreground">
                          {s.message ?? (s.status === 'generating' ? '正在生成脚本...' : '正在验证...')}
                        </p>
                      )}
                      {s.status === 'success' && (
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                            脚本验证通过
                          </span>
                          {s.items.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              采集到 {s.items.length} 条内容
                            </span>
                          )}
                        </div>
                      )}
                      {s.status === 'unverified' && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                          脚本已生成（沙箱不可用，未验证）
                        </p>
                      )}
                      {s.status === 'failed' && (
                        <p className="text-xs text-destructive mt-1 break-words">{s.error}</p>
                      )}

                      {/* LLM log button */}
                      {(sourceLLMCalls[globalIdx] ?? []).length > 0 && (
                        <button
                          className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setLogTarget({ idx: globalIdx, title: source.title })}
                        >
                          <ScrollText className="h-3 w-3" />
                          查看 LLM 日志（{(sourceTokens[globalIdx] ?? 0).toLocaleString()} tokens）
                        </button>
                      )}

                      {/* Per-source action buttons */}
                      <div className="mt-2 flex flex-wrap items-start gap-2">
                        {/* Abort in-progress generation */}
                        {inProgress && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => abortSource(globalIdx)}
                          >
                            <Square className="h-3 w-3 mr-1" />
                            中断
                          </Button>
                        )}

                        {/* Start button (skipped) — directly launch without prompt dialog */}
                        {s.status === 'skipped' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => generateSource(globalIdx)}
                          >
                            <Play className="h-3 w-3 mr-1" />开始生成
                          </Button>
                        )}

                        {/* Retry button (failed) — expand panel with optional prompt */}
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

                        {/* Expanded retry panel with optional user prompt textarea */}
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
                                onClick={() =>
                                  generateSource(globalIdx, userPromptInputs[globalIdx])
                                }
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

      {/* All-failed banner with bulk retry */}
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

      {/* Mobile: fixed bottom bar; Desktop: inline */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t md:static md:border-t-0 md:bg-transparent md:p-0 md:mt-2">
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onBack}
            disabled={anyInProgress}
            className="flex-none"
          >
            返回
          </Button>
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
          {hasSuccess && !anyInProgress && onManagedCreate && (
            <Button
              variant="outline"
              onClick={() => onManagedCreate(successSources)}
              className="flex-none"
              title="跳过确认步骤，在后台直接创建订阅"
            >
              <Bot className="h-4 w-4 mr-1.5" />
              后台托管创建
            </Button>
          )}
        </div>
      </div>

      {/* LLM call log dialog */}
      {logTarget && (
        <LLMLogDialog
          sourceTitle={logTarget.title}
          calls={sourceLLMCalls[logTarget.idx] ?? []}
          totalTokens={sourceTokens[logTarget.idx] ?? 0}
          onClose={() => setLogTarget(null)}
        />
      )}
    </div>
  );
}
