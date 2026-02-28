'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle, Info, ChevronRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LogEntry {
  id: string;
  step: 'find_sources' | 'generate_script' | 'complete';
  level: 'info' | 'progress' | 'success' | 'error';
  message: string;
  payload: unknown;
  createdAt: number;
}

interface ProgressData {
  status: string | null;
  error: string | null;
  logs: LogEntry[];
}

interface ManagedProgressDrawerProps {
  subscriptionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onTakeover: () => void;
  onDiscard: (id: string) => void;
}

const STEP_LABELS: Record<string, string> = {
  find_sources: '发现数据源',
  generate_script: '生成脚本',
  complete: '完成创建',
};

function LevelIcon({ level }: { level: string }) {
  if (level === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />;
  if (level === 'error') return <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0 mt-0.5" />;
  if (level === 'progress') return <ChevronRight className="h-3.5 w-3.5 text-blue-400 flex-shrink-0 mt-0.5" />;
  return <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />;
}

export default function ManagedProgressDrawer({
  subscriptionId,
  isOpen,
  onClose,
  onTakeover,
  onDiscard,
}: ManagedProgressDrawerProps) {
  const router = useRouter();
  const [data, setData] = useState<ProgressData | null>(null);
  const [takeoverLoading, setTakeoverLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchProgress = useCallback(async () => {
    if (!subscriptionId) return;
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/managed-progress`);
      if (!res.ok) return;
      const d: ProgressData = await res.json();
      setData(d);
      // Auto-scroll to bottom
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
    } catch { /* ignore */ }
  }, [subscriptionId]);

  useEffect(() => {
    if (!isOpen || !subscriptionId) {
      setData(null);
      return;
    }

    fetchProgress();
    intervalRef.current = setInterval(fetchProgress, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOpen, subscriptionId, fetchProgress]);

  // Stop polling when done
  useEffect(() => {
    if (data?.status !== 'managed_creating' && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [data?.status]);

  const handleTakeover = async () => {
    if (!subscriptionId || takeoverLoading) return;
    setTakeoverLoading(true);
    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/managed-takeover`, {
        method: 'POST',
      });
      const result = await res.json();

      if (result.alreadyDone) {
        // Subscription was completed before takeover — just close and refresh
        onClose();
        onTakeover();
        return;
      }

      // Store wizard state and navigate to wizard
      const wizardState = {
        step: result.resumeStep,
        topic: result.topic,
        criteria: result.criteria ?? '',
        foundSources: result.foundSources ?? [],
        selectedIndices: result.foundSources?.map((_: unknown, i: number) => i) ?? [],
        generatedSources: result.generatedSources ?? [],
        subscriptionId: undefined,
      };
      sessionStorage.setItem('wizard-state', JSON.stringify(wizardState));
      onClose();
      onTakeover();
      router.push('/subscriptions/new');
    } catch {
      // ignore
    } finally {
      setTakeoverLoading(false);
    }
  };

  const isDone = data?.status === null || (!data?.status && data?.logs && data.logs.some((l) => l.step === 'complete' && l.level === 'success'));
  const isFailed = data?.status === 'failed';
  const isCreating = data?.status === 'managed_creating';

  // Group logs by step
  const groupedLogs: Record<string, LogEntry[]> = {};
  for (const log of (data?.logs ?? [])) {
    if (!groupedLogs[log.step]) groupedLogs[log.step] = [];
    groupedLogs[log.step].push(log);
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>托管创建进度</SheetTitle>
        </SheetHeader>

        {/* Status summary */}
        <div className="flex-shrink-0 px-0 py-2">
          {isCreating && (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>正在创建中...</span>
            </div>
          )}
          {isDone && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              <span>创建完成</span>
            </div>
          )}
          {isFailed && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-destructive text-sm">
                <XCircle className="h-4 w-4" />
                <span>创建失败</span>
              </div>
              {data?.error && (
                <p className="text-xs text-muted-foreground ml-6">{data.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Log list */}
        <ScrollArea className="flex-1 min-h-0">
          <div ref={scrollRef} className="flex flex-col gap-4 pr-2">
            {Object.entries(groupedLogs).map(([step, logs]) => (
              <div key={step}>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {STEP_LABELS[step] ?? step}
                </h4>
                <div className="flex flex-col gap-1 pl-2 border-l-2 border-muted">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2">
                      <LevelIcon level={log.level} />
                      <p className={[
                        'text-xs leading-relaxed',
                        log.level === 'error' ? 'text-destructive' :
                        log.level === 'success' ? 'text-green-700 dark:text-green-400' :
                        'text-muted-foreground',
                      ].join(' ')}>
                        {log.message}
                      </p>
                    </div>
                  ))}
                  {isCreating && step === Object.keys(groupedLogs).at(-1) && (
                    <div className="flex gap-1 items-center pl-1 py-1">
                      <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {!data && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer actions */}
        <div className="flex-shrink-0 pt-4 border-t flex gap-3">
          {isCreating && (
            <Button
              variant="outline"
              onClick={handleTakeover}
              disabled={takeoverLoading}
              className="flex-1"
            >
              {takeoverLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              接管
            </Button>
          )}
          {isDone && subscriptionId && (
            <Button
              className="flex-1"
              onClick={() => {
                onClose();
                router.push(`/subscriptions/${subscriptionId}`);
              }}
            >
              查看订阅
            </Button>
          )}
          {isFailed && subscriptionId && (
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                onDiscard(subscriptionId);
                onClose();
              }}
            >
              删除
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} className="flex-none">
            关闭
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
