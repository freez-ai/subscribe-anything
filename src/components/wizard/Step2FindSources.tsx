'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, Search, BrainCircuit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot as BotIcon } from 'lucide-react';
import LLMLogDialog from '@/components/debug/LLMLogDialog';
import type { LLMCallInfo } from '@/lib/ai/client';
import type { FoundSource, WizardState } from '@/types/wizard';

interface Step2FindSourcesProps {
  state: WizardState;
  onStateChange: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  onStep2Next?: (selectedSources: FoundSource[]) => void;
  onManagedCreate?: (foundSources: FoundSource[]) => void;
  onDiscard?: () => void;
}

interface LogEntry {
  type: 'log';
  id: string;
  step: string;
  level: string;
  message: string;
  payload: unknown;
}

function defaultSelection(sources: FoundSource[]): Set<number> {
  if (sources.length === 0) return new Set();
  const recommended = sources.reduce<number[]>((acc, s, i) => {
    if (s.recommended) acc.push(i);
    return acc;
  }, []);
  return new Set(recommended.length > 0 ? recommended : sources.map((_, i) => i));
}

export default function Step2FindSources({
  state,
  onStateChange,
  onBack,
  onStep2Next,
  onManagedCreate,
  onDiscard,
}: Step2FindSourcesProps) {
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [sources, setSources] = useState<FoundSource[]>(
    state.foundSources.length > 0 ? state.foundSources : []
  );
  const [checkedIndices, setCheckedIndices] = useState<Set<number>>(() => {
    if (state.selectedIndices.length > 0) return new Set(state.selectedIndices);
    if (state.foundSources.length > 0) return defaultSelection(state.foundSources);
    return new Set();
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDone, setIsDone] = useState(state.foundSources.length > 0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSearchProviderError, setIsSearchProviderError] = useState(false);
  const [llmCalls, setLLMCalls] = useState<LLMCallInfo[]>(state.step2LlmCalls ?? []);
  const [showLLMLog, setShowLLMLog] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const seenQueriesRef = useRef(new Set<string>());

  // Poll for LLM calls while subscriptionId is available
  useEffect(() => {
    if (!state.subscriptionId) return;
    const subId = state.subscriptionId;
    const poll = () => {
      fetch(`/api/subscriptions/${subId}/llm-calls`)
        .then((r) => r.json())
        .then((data: { calls?: LLMCallInfo[] }) => {
          if (data.calls && data.calls.length > 0) {
            setLLMCalls(data.calls);
            // 同步到 wizard state，确保暂存/重入向导时能从 DB 恢复
            onStateChange({ step2LlmCalls: data.calls });
          }
        })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.subscriptionId]);

  const connectSSE = () => {
    const subscriptionId = state.subscriptionId;
    if (!subscriptionId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsStreaming(true);
    setErrorMessage('');
    setIsSearchProviderError(false);

    (async () => {
      try {
        const res = await fetch(`/api/subscriptions/${subscriptionId}/stream-progress`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }

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
              const event = JSON.parse(line.slice(6)) as LogEntry | { type: 'done'; reason?: string };

              if (event.type === 'done') {
                setIsStreaming(false);
                return;
              }

              if (event.type !== 'log' || event.step !== 'find_sources') continue;

              // Search query progress
              if (event.level === 'progress' && event.message.startsWith('搜索：')) {
                const q = event.message.slice(3);
                if (!seenQueriesRef.current.has(q)) {
                  seenQueriesRef.current.add(q);
                  setSearchQueries((prev) => [...prev, q]);
                }
              }

              // Success: sources found
              if (event.level === 'success' && Array.isArray(event.payload)) {
                const allSources = event.payload as FoundSource[];
                const sel = defaultSelection(allSources);
                setSources(allSources);
                setCheckedIndices(sel);
                setIsDone(true);
                setIsStreaming(false);
                onStateChange({
                  foundSources: allSources,
                  selectedIndices: Array.from(sel).sort((a, b) => a - b),
                });
                return;
              }

              // Error
              if (event.level === 'error') {
                setErrorMessage(event.message);
                if (
                  event.message.toLowerCase().includes('search provider') ||
                  event.message.toLowerCase().includes('no search') ||
                  event.message.toLowerCase().includes('搜索供应商')
                ) {
                  setIsSearchProviderError(true);
                }
                setIsStreaming(false);
                return;
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : '连接失败';
        setErrorMessage(msg);
        if (
          msg.toLowerCase().includes('search provider') ||
          msg.toLowerCase().includes('搜索供应商')
        ) {
          setIsSearchProviderError(true);
        }
        setIsStreaming(false);
      }
    })();
  };

  // Connect to SSE on mount if we have a subscriptionId and sources not yet cached
  useEffect(() => {
    if (state.foundSources.length === 0 && state.subscriptionId) {
      connectSSE();
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = async () => {
    if (!state.subscriptionId) return;
    setIsDone(false);
    setSources([]);
    setCheckedIndices(new Set());
    setSearchQueries([]);
    seenQueriesRef.current.clear();
    setErrorMessage('');
    setIsSearchProviderError(false);
    setLLMCalls([]);
    onStateChange({ step2LlmCalls: [] });

    // Restart find_sources step in background (clears old logs)
    await fetch(`/api/subscriptions/${state.subscriptionId}/run-step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'find_sources' }),
    }).catch(() => {});

    connectSSE();
  };

  const toggleIndex = (idx: number) => {
    setCheckedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedIndices.size === sources.length) {
      setCheckedIndices(new Set());
    } else {
      setCheckedIndices(new Set(sources.map((_, i) => i)));
    }
  };

  const handleNext = () => {
    const selectedSources = Array.from(checkedIndices)
      .sort((a, b) => a - b)
      .map((i) => sources[i])
      .filter(Boolean);
    onStateChange({
      foundSources: sources,
      selectedIndices: Array.from(checkedIndices).sort((a, b) => a - b),
    });
    if (onStep2Next) {
      onStep2Next(selectedSources);
    }
  };

  const selectedCount = checkedIndices.size;
  const recommendedCount = sources.filter((s) => s.recommended).length;

  return (
    <div className="flex flex-col gap-4 pt-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold mb-1">发现数据源</h2>
        <p className="text-sm text-muted-foreground">
          主题：<span className="text-foreground font-medium">{state.topic}</span>
          {state.criteria && (
            <>
              {' '}· 条件：<span className="text-foreground">{state.criteria}</span>
            </>
          )}
        </p>
        {llmCalls.length > 0 && (
          <button
            onClick={() => setShowLLMLog(true)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs h-6 px-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="查看 LLM 调用日志"
          >
            <BrainCircuit className="h-3 w-3" />
            LLM调用日志
          </button>
        )}
      </div>

      {/* Search progress pills */}
      {(isStreaming || searchQueries.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchQueries.map((q, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs"
            >
              <Search className="h-3 w-3 flex-shrink-0" />
              <span className="font-medium text-foreground">{q}</span>
            </span>
          ))}
          {isStreaming && (
            <div className="flex gap-1 items-center px-1">
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <p className="font-medium text-destructive mb-1">发生错误</p>
          <p className="text-muted-foreground text-xs">{errorMessage}</p>
          {isSearchProviderError && (
            <p className="mt-2 text-xs">
              需要配置搜索供应商，请前往{' '}
              <Link href="/settings" className="text-primary underline">
                设置页面
              </Link>{' '}
              配置后重试
            </p>
          )}
          <Button variant="outline" size="sm" className="mt-3" onClick={handleRetry}>
            重试
          </Button>
        </div>
      )}

      {/* Source list */}
      {sources.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              共发现 {sources.length} 个数据源
              {recommendedCount > 0 && (
                <>
                  ，已默认勾选{' '}
                  <span className="font-medium text-foreground">{recommendedCount}</span> 个推荐源
                </>
              )}
              {isDone && (
                <>
                  {' '}· 已选{' '}
                  <span className="font-semibold text-foreground">{selectedCount}</span> 个
                </>
              )}
            </p>
            {isDone && (
              <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs h-7 px-2">
                {checkedIndices.size === sources.length ? '取消全选' : '全选'}
              </Button>
            )}
          </div>

          <ScrollArea className="h-[46vh] md:h-[42vh] rounded-lg border">
            <div className="divide-y">
              {sources.map((source, idx) => {
                const isChecked = checkedIndices.has(idx);
                return (
                  <label
                    key={idx}
                    className="flex gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleIndex(idx)}
                      disabled={!isDone}
                      className="mt-1 h-4 w-4 rounded border-border accent-primary flex-shrink-0 cursor-pointer disabled:cursor-default"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="font-semibold text-sm leading-snug">{source.title}</span>
                        {source.recommended && (
                          <Badge className="h-4 px-1.5 text-[10px] bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 font-medium">
                            推荐
                          </Badge>
                        )}
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                          aria-label="在新标签页打开"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mb-1">{source.url}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {source.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        </>
      )}

      {/* Empty state after done */}
      {!isStreaming && isDone && sources.length === 0 && !errorMessage && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-3">
          <p>没有找到数据源</p>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            重试
          </Button>
        </div>
      )}

      {/* Initial loading state */}
      {isStreaming && sources.length === 0 && searchQueries.length === 0 && !errorMessage && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p>AI 正在搜索合适的数据源...</p>
        </div>
      )}

      {/* Bottom bar */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t md:static md:border-t-0 md:bg-transparent md:p-0 md:mt-2">
        <div className="flex gap-3">
          <Button
            onClick={handleNext}
            disabled={!isDone || selectedCount === 0}
            className="flex-1 md:flex-none"
          >
            {isStreaming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                分析中
              </>
            ) : selectedCount > 0 ? (
              `下一步（${selectedCount} 个源）`
            ) : (
              '下一步'
            )}
          </Button>
          <Button variant="outline" onClick={onBack} className="flex-none">
            暂存
          </Button>
          {onManagedCreate && (
            <Button
              variant="outline"
              onClick={() => {
                abortRef.current?.abort();
                const selected = Array.from(checkedIndices).map((i) => sources[i]).filter(Boolean);
                onManagedCreate(selected);
              }}
              disabled={isDone && selectedCount === 0}
              className="flex-none"
              title="AI 自动完成脚本生成，在后台创建订阅"
            >
              <BotIcon className="h-4 w-4 mr-1.5" />
              {isStreaming ? '转后台托管' : '后台托管创建'}
            </Button>
          )}
          {onDiscard && (
            <Button
              variant="ghost"
              onClick={onDiscard}
              className="flex-none text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              丢弃
            </Button>
          )}
        </div>
      </div>

      {/* LLM Log Dialog */}
      {showLLMLog && (
        <LLMLogDialog
          sourceTitle={`发现数据源 — ${state.topic}`}
          calls={llmCalls}
          totalTokens={llmCalls.reduce((sum, c) => sum + (c.usage?.total ?? 0), 0)}
          onClose={() => setShowLLMLog(false)}
        />
      )}
    </div>
  );
}
