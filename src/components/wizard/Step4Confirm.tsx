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
import { Eye, Loader2, Trash2 } from 'lucide-react';
import { CRON_PRESETS } from '@/lib/utils/cron';
import { ItemPreviewDialog } from '@/components/wizard/ItemPreviewDialog';
import type { GeneratedSource, WizardState } from '@/types/wizard';

interface Step4ConfirmProps {
  state: WizardState;
  onStateChange: (updates: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  onComplete: (subscriptionId: string) => void;
  onDiscard?: () => void;
}

const CUSTOM_VALUE = '__custom__';

export default function Step4Confirm({
  state,
  onStateChange,
  onBack,
  onComplete,
  onDiscard,
}: Step4ConfirmProps) {
  const [sources, setSources] = useState<GeneratedSource[]>(state.generatedSources);
  const [customCrons, setCustomCrons] = useState<Record<number, string>>({});
  const [editingTitleIdx, setEditingTitleIdx] = useState<number | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [previewSource, setPreviewSource] = useState<GeneratedSource | null>(null);

  const startEditTitle = (idx: number) => {
    setEditingTitleIdx(idx);
    setEditingTitleValue(sources[idx].title);
  };

  const commitEditTitle = () => {
    if (editingTitleIdx !== null) {
      const trimmed = editingTitleValue.trim();
      if (trimmed) updateSource(editingTitleIdx, { title: trimmed });
    }
    setEditingTitleIdx(null);
  };

  const cancelEditTitle = () => setEditingTitleIdx(null);

  const deleteSource = (idx: number) => {
    setSources((prev) => prev.filter((_, i) => i !== idx));
  };

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

    const sourcesPayload = sources.map((s) => ({
      title: s.title,
      url: s.url,
      description: s.description,
      script: s.script,
      cronExpression: s.cronExpression,
      isEnabled: s.isEnabled,
      initialItems: s.initialItems,
    }));

    try {
      let createdId: string;

      if (state.subscriptionId) {
        // Wizard was persisted: use complete-wizard endpoint
        const res = await fetch(`/api/subscriptions/${state.subscriptionId}/complete-wizard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sources: sourcesPayload, criteria: state.criteria }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(errText || `HTTP ${res.status}`);
        }

        const data = await res.json();
        createdId = data.id;
      } else {
        // No persisted subscription: create from scratch
        const body = {
          topic: state.topic,
          criteria: state.criteria,
          sources: sourcesPayload,
        };

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
        createdId = created.id;
      }

      // Update parent state then trigger completion
      onStateChange({ generatedSources: sources });
      onComplete(createdId);
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
                        {editingTitleIdx === idx ? (
                          <Input
                            autoFocus
                            className="h-7 text-sm font-semibold px-1 py-0 w-auto min-w-0 flex-1"
                            value={editingTitleValue}
                            onChange={(e) => setEditingTitleValue(e.target.value)}
                            onBlur={commitEditTitle}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEditTitle();
                              if (e.key === 'Escape') cancelEditTitle();
                            }}
                          />
                        ) : (
                          <span
                            className="font-semibold text-sm cursor-pointer hover:underline underline-offset-2"
                            onClick={() => startEditTitle(idx)}
                            title="点击编辑名称"
                          >
                            {source.title}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className="text-green-600 border-green-500/50 bg-green-500/10 text-xs"
                        >
                          已验证
                        </Badge>
                      </div>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground truncate mt-0.5 hover:underline underline-offset-2 block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {source.url}
                      </a>
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
                      <button
                        onClick={() => deleteSource(idx)}
                        className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                        title="删除此数据源"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
          <Button variant="outline" onClick={onBack} disabled={isSubmitting} className="flex-none">
            暂存
          </Button>
          {onDiscard && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDiscard}
              disabled={isSubmitting}
              className="flex-none text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="丢弃此次订阅创建"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Item preview dialog */}
      {previewSource && (
        <ItemPreviewDialog title={previewSource.title} items={previewSource.initialItems} onClose={() => setPreviewSource(null)} />
      )}
    </div>
  );
}

