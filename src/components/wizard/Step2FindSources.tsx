'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bot, ExternalLink, Loader2, Search, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import LLMLogDialog from '@/components/debug/LLMLogDialog';
import type { LLMCallInfo } from '@/lib/ai/client';
import type { FoundSource, WizardState } from '@/types/wizard';

interface Step2FindSourcesProps {
  state: WizardState;
  onStateChange: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  onManagedCreate?: (foundSources: FoundSource[]) => void;
  // When true (default), auto-start streaming if no cached sources.
  // Set to false when resuming from takeover/restore so the user can choose.
  autoStart?: boolean;
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
  onNext,
  onBack,
  onManagedCreate,
  autoStart = true,
}: Step2FindSourcesProps) {
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [llmCalls, setLlmCalls] = useState<LLMCallInfo[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const countedCallsRef = useRef(new Set<number>());
  const [sources, setSources] = useState<FoundSource[]>(
    state.foundSources.length > 0 ? state.foundSources : []
  );
  const [checkedIndices, setCheckedIndices] = useState<Set<number>>(() => {
    if (state.selectedIndices.length > 0) return new Set(state.selectedIndices);
    if (state.foundSources.length > 0) return defaultSelection(state.foundSources);
    return new Set();
  });
  // started: true if streaming has been initiated at least once (or sources already exist)
  const [started, setStarted] = useState(autoStart || state.foundSources.length > 0);
  const [isStreaming, setIsStreaming] = useState(
    state.foundSources.length === 0 && autoStart
  );
  const [isDone, setIsDone] = useState(state.foundSources.length > 0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSearchProviderError, setIsSearchProviderError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const startStream = async () => {
    setSearchQueries([]);
    setLlmCalls([]);
    setTotalTokens(0);
    countedCallsRef.current.clear();
    setSources([]);
    setCheckedIndices(new Set());
    setErrorMessage('');
    setIsSearchProviderError(false);
    setIsStreaming(true);
    setIsDone(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/wizard/find-sources', {
        method: 'POST',
        body: JSON.stringify({ topic: state.topic, criteria: state.criteria }),
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(errText || `HTTP ${res.status}`);
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
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              handleEvent(event);
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setErrorMessage(msg);
      if (
        msg.toLowerCase().includes('search provider') ||
        msg.toLowerCase().includes('no search') ||
        msg.toLowerCase().includes('搜索供应商')
      ) {
        setIsSearchProviderError(true);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const handleEvent = (event: Record<string, unknown>) => {
    switch (event.type) {
      case 'tool_call':
        if (event.name === 'webSearch') {
          const args = event.args as { query: string };
          setSearchQueries((prev) => [...prev, args.query]);
        }
        break;
      case 'sources': {
        const foundSources = event.sources as FoundSource[];
        setSources(foundSources);
        setCheckedIndices(defaultSelection(foundSources));
        break;
      }
      case 'done':
        setIsDone(true);
        break;
      case 'llm_call': {
        const info = event as unknown as LLMCallInfo;
        setLlmCalls((prev) => {
          const existingIdx = prev.findIndex((c) => c.callIndex === info.callIndex);
          if (existingIdx >= 0) {
            const next = [...prev];
            next[existingIdx] = info;
            return next;
          }
          return [...prev, info];
        });
        // Accumulate tokens once per completed call
        if (!info.streaming && info.usage?.total && !countedCallsRef.current.has(info.callIndex)) {
          countedCallsRef.current.add(info.callIndex);
          setTotalTokens((prev) => prev + info.usage!.total);
        }
        break;
      }
      case 'error': {
        const msg = event.message as string;
        setErrorMessage(msg);
        if (
          msg.toLowerCase().includes('search provider') ||
          msg.toLowerCase().includes('no search') ||
          msg.toLowerCase().includes('搜索供应商')
        ) {
          setIsSearchProviderError(true);
        }
        break;
      }
    }
  };

  useEffect(() => {
    // Auto-start only when coming from Step1 (autoStart=true) and no cached sources
    if (state.foundSources.length === 0 && autoStart) {
      startStream();
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    onStateChange({
      foundSources: sources,
      selectedIndices: Array.from(checkedIndices).sort((a, b) => a - b),
    });
    onNext();
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

      {/* LLM log button */}
      {llmCalls.length > 0 && (
        <button
          className="self-start flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowLog(true)}
        >
          <ScrollText className="h-3 w-3" />
          查看 LLM 调用日志（{totalTokens.toLocaleString()} tokens）
        </button>
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
          <Button variant="outline" size="sm" className="mt-3" onClick={startStream}>
            重试
          </Button>
        </div>
      )}

      {/* Initial state: not yet started (e.g. restored from takeover) */}
      {!started && !isStreaming && !isDone && !errorMessage && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
          <p>点击"开始分析"让 AI 发现合适的数据源</p>
          {onManagedCreate && (
            <p className="text-xs">或选择"后台托管创建"让系统在后台自动完成所有步骤</p>
          )}
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
      {started && !isStreaming && isDone && sources.length === 0 && !errorMessage && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-3">
          <p>没有找到数据源</p>
          <Button variant="outline" size="sm" onClick={startStream}>
            重试
          </Button>
        </div>
      )}

      {/* Bottom bar */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t md:static md:border-t-0 md:bg-transparent md:p-0 md:mt-2">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} disabled={isStreaming} className="flex-none">
            返回
          </Button>
          {started ? (
            <Button
              onClick={handleNext}
              disabled={!isDone || selectedCount === 0}
              className="flex-1 md:flex-none"
            >
              {!isDone && !errorMessage ? (
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
          ) : (
            <Button
              onClick={() => { setStarted(true); startStream(); }}
              className="flex-1 md:flex-none"
            >
              开始分析
            </Button>
          )}
          {onManagedCreate && (
            <Button
              variant="outline"
              onClick={() => {
                abortRef.current?.abort();
                const selected = Array.from(checkedIndices).map((i) => sources[i]).filter(Boolean);
                onManagedCreate(selected.length > 0 ? selected : sources);
              }}
              className="flex-none"
              title="AI 自动完成脚本生成，在后台创建订阅"
            >
              <Bot className="h-4 w-4 mr-1.5" />
              {isStreaming ? '转后台托管' : '后台托管创建'}
            </Button>
          )}
        </div>
      </div>
      {/* LLM log dialog */}
      {showLog && (
        <LLMLogDialog
          sourceTitle={`发现源：${state.topic}`}
          calls={llmCalls}
          totalTokens={totalTokens}
          onClose={() => setShowLog(false)}
        />
      )}
    </div>
  );
}
