'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Eye, ExternalLink, Loader2, X } from 'lucide-react';
import { CRON_PRESETS } from '@/lib/utils/cron';
import { formatDistanceToNow } from '@/lib/utils/time';
import type { CollectedItem } from '@/lib/sandbox/contract';
import type { GeneratedSource, WizardState } from '@/types/wizard';

interface Step5PreviewProps {
  state: WizardState;
  onStateChange: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  onComplete: (subscriptionId: string) => void;
}

const CUSTOM_VALUE = '__custom__';

export default function Step5Preview({
  state,
  onStateChange,
  onBack,
  onComplete,
}: Step5PreviewProps) {
  const [sources, setSources] = useState<GeneratedSource[]>(state.generatedSources);
  const [customCrons, setCustomCrons] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [previewSource, setPreviewSource] = useState<GeneratedSource | null>(null);

  const updateSource = (idx: number, patch: Partial<GeneratedSource>) => {
    setSources((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const getCronSelectValue = (idx: number, cronExpression: string): string => {
    const preset = CRON_PRESETS.find((p) => p.value === cronExpression);
    if (preset) return cronExpression;
    return CUSTOM_VALUE;
  };

  const handleCronSelectChange = (idx: number, value: string) => {
    if (value === CUSTOM_VALUE) {
      // Keep current expression as custom
      setCustomCrons((prev) => ({ ...prev, [idx]: sources[idx].cronExpression }));
    } else {
      updateSource(idx, { cronExpression: value });
      setCustomCrons((prev) => {
        const next = { ...prev };
        delete next[idx];
        return next;
      });
    }
  };

  const handleCustomCronChange = (idx: number, value: string) => {
    setCustomCrons((prev) => ({ ...prev, [idx]: value }));
    updateSource(idx, { cronExpression: value });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage('');

    const body = {
      topic: state.topic,
      criteria: state.criteria,
      sources: sources.map((s) => ({
        title: s.title,
        url: s.url,
        description: s.description,
        script: s.script,
        cronExpression: s.cronExpression,
        isEnabled: s.isEnabled,
        initialItems: s.initialItems,
      })),
    };

    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const created = await res.json();

      // Update parent state then trigger completion
      onStateChange({ generatedSources: sources });
      onComplete(created.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '提交失败，请重试';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">确认并创建订阅</h2>
        <p className="text-sm text-muted-foreground">
          检查以下数据源配置，可调整采集频率和开关后提交
        </p>
      </div>

      {/* Topic summary */}
      <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm flex flex-col gap-0.5">
        <span className="text-muted-foreground text-xs">订阅主题</span>
        <span className="font-medium">{state.topic}</span>
        {state.criteria && (
          <>
            <span className="text-muted-foreground text-xs mt-1">监控条件</span>
            <span className="text-sm">{state.criteria}</span>
          </>
        )}
      </div>

      <ScrollArea className="h-[48vh] md:h-[45vh]">
        <div className="flex flex-col gap-3 pr-2">
          {sources.map((source, idx) => {
            const selectValue = getCronSelectValue(idx, source.cronExpression);
            const isCustom = selectValue === CUSTOM_VALUE;
            const customValue = customCrons[idx] ?? source.cronExpression;

            return (
              <Card key={idx}>
                <CardContent className="p-4 flex flex-col gap-3">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{source.title}</span>
                        <Badge
                          variant="outline"
                          className="text-green-600 border-green-500/50 bg-green-500/10 text-xs"
                        >
                          已验证
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{source.url}</p>
                    </div>
                    {/* Enable/disable switch */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {source.isEnabled ? '启用' : '禁用'}
                      </span>
                      <Switch
                        checked={source.isEnabled}
                        onCheckedChange={(checked) => updateSource(idx, { isEnabled: checked })}
                      />
                    </div>
                  </div>

                  {/* Item count + preview */}
                  {source.initialItems.length > 0 && (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        已采集 {source.initialItems.length} 条初始内容
                      </p>
                      <button
                        onClick={() => setPreviewSource(source)}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2"
                      >
                        <Eye className="h-3 w-3" />
                        预览
                      </button>
                    </div>
                  )}

                  {/* Cron selector */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-muted-foreground">采集频率</label>
                    <Select value={selectValue} onValueChange={(v) => handleCronSelectChange(idx, v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CRON_PRESETS.map((preset) => (
                          <SelectItem key={preset.value} value={preset.value} className="text-xs">
                            {preset.label}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_VALUE} className="text-xs">
                          自定义 Cron 表达式
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {isCustom && (
                      <Input
                        className="h-8 text-xs font-mono"
                        placeholder="0 */6 * * *"
                        value={customValue}
                        onChange={(e) => handleCustomCronChange(idx, e.target.value)}
                      />
                    )}
                    {!isCustom && (
                      <p className="text-xs text-muted-foreground font-mono">{source.cronExpression}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {/* Mobile: fixed bottom; Desktop: inline */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t md:static md:border-t-0 md:bg-transparent md:p-0 md:mt-2">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} disabled={isSubmitting} className="flex-none">
            返回
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || sources.length === 0}
            className="flex-1 md:flex-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                创建中...
              </>
            ) : (
              '完成创建'
            )}
          </Button>
        </div>
      </div>

      {/* Item preview dialog */}
      {previewSource && (
        <ItemPreviewDialog source={previewSource} onClose={() => setPreviewSource(null)} />
      )}
    </div>
  );
}

/* ── Item Preview Dialog ── */
function ItemPreviewDialog({
  source,
  onClose,
}: {
  source: GeneratedSource;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50">
      <div className="bg-background w-full md:max-w-2xl md:rounded-xl shadow-xl flex flex-col max-h-[90vh] rounded-t-xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b flex-shrink-0">
          <div className="min-w-0 pr-4">
            <h2 className="font-semibold text-base truncate">{source.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {source.initialItems.length} 条已采集内容预览
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Timeline list */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {source.initialItems.map((item, i) => (
            <PreviewTimelineCard key={i} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Preview Timeline Card ── */
function CriteriaResultBadge({
  result,
  metricValue,
}: {
  result?: 'matched' | 'not_matched' | 'invalid';
  metricValue?: string;
}) {
  if (result === 'matched') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-sm bg-green-500/15 text-green-600 dark:text-green-400 font-medium flex-shrink-0">
        ✓{metricValue ? ` ${metricValue}` : ' 满足条件'}
      </span>
    );
  }
  if (result === 'not_matched') {
    return (
      <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground flex-shrink-0">
        {metricValue ? `✗ ${metricValue}` : '未满足'}
      </span>
    );
  }
  return null;
}

function PreviewTimelineCard({ item }: { item: CollectedItem }) {
  return (
    <button
      onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
      className="w-full text-left rounded-lg border p-3 transition-colors flex gap-3 items-start bg-card hover:bg-accent/60"
    >
      {item.thumbnailUrl && (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="w-12 h-12 rounded object-cover flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug line-clamp-2">{item.title}</p>
        {item.summary && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.summary}</p>
        )}
        <div className="flex items-center mt-1 gap-2">
          {item.publishedAt && (
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(item.publishedAt)}
            </span>
          )}
          {item.criteriaResult && (
            <CriteriaResultBadge result={item.criteriaResult} metricValue={item.metricValue} />
          )}
          <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
        </div>
      </div>
    </button>
  );
}
