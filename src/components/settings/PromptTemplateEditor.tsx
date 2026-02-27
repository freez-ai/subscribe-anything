'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

interface PromptTemplate {
  id: string;
  name: string;
  description?: string | null;
  content: string;
  providerId?: string | null;
}

interface Provider {
  id: string;
  name: string;
  modelId: string;
  isActive: boolean;
}

const UNSET = '__default__';

interface TemplateCardProps {
  template: PromptTemplate;
  providers: Provider[];
  onRefresh: () => void;
  isAdmin?: boolean;
}

function TemplateCard({ template, providers, onRefresh, isAdmin = false }: TemplateCardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState(template.content);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    template.providerId ?? UNSET
  );
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Sync when template data changes (e.g. after reset)
  useEffect(() => {
    setContent(template.content);
    setSelectedProviderId(template.providerId ?? UNSET);
  }, [template.content, template.providerId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/prompt-templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast({ title: '保存成功', description: `"${template.name}" 已更新` });
    } catch {
      toast({ title: '保存失败', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleProviderChange = async (value: string) => {
    const newProviderId = value === UNSET ? null : value;
    setSelectedProviderId(value);
    try {
      const res = await fetch(`/api/settings/prompt-templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: newProviderId }),
      });
      if (!res.ok) throw new Error('Failed to update provider');
      toast({ title: '供应商已更新' });
    } catch {
      // Revert on failure
      setSelectedProviderId(template.providerId ?? UNSET);
      toast({ title: '更新失败', variant: 'destructive' });
    }
  };

  const handleReset = async () => {
    if (!window.confirm(`确定要将"${template.name}"恢复为默认内容吗？`)) return;

    setResetting(true);
    try {
      const res = await fetch(`/api/settings/prompt-templates/${template.id}/reset`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to reset');
      toast({ title: '已恢复默认', description: `"${template.name}" 已恢复为默认内容` });
      onRefresh();
    } catch {
      toast({ title: '恢复失败', variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  const activeProvider = providers.find((p) => p.isActive);
  const selectedProvider = providers.find((p) => p.id === selectedProviderId);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">{template.name}</CardTitle>
            {template.description && (
              <CardDescription className="mt-1 text-sm">{template.description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {selectedProvider ? (
              <span className="text-xs text-muted-foreground hidden sm:block">
                {selectedProvider.name} · {selectedProvider.modelId}
              </span>
            ) : activeProvider ? (
              <span className="text-xs text-muted-foreground hidden sm:block">
                {activeProvider.name} · {activeProvider.modelId}
              </span>
            ) : null}
            <span className="text-muted-foreground text-xs">
              {expanded ? '收起' : '展开'}
            </span>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <>
          <Separator />
          <CardContent className="pt-4 space-y-4">
            {/* Provider selector - admin only */}
            {isAdmin && (
            <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
              <Label className="text-sm">关联供应商</Label>
              <Select value={selectedProviderId} onValueChange={handleProviderChange}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder="使用默认激活供应商" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>
                    使用激活供应商
                    {activeProvider && (
                      <span className="ml-2 text-muted-foreground">
                        ({activeProvider.name} · {activeProvider.modelId})
                      </span>
                    )}
                  </SelectItem>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-1.5">
                        {p.name} · {p.modelId}
                        {p.isActive && (
                          <Badge variant="default" className="text-[10px] px-1 py-0 ml-1">激活</Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                为此模板单独指定供应商，可在不同场景使用不同智能程度的模型。
              </p>
            </div>
            )}

            {isAdmin && <Separator />}

            {/* Content editor */}
            <div className="space-y-3">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                className="font-mono text-sm resize-y"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={resetting || saving}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  {resetting ? '恢复中...' : '恢复默认'}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || resetting}>
                  {saving ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}

export default function PromptTemplateEditor({ isAdmin = false }: { isAdmin?: boolean }) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const requests: Promise<Response>[] = [fetch('/api/settings/prompt-templates')];
      if (isAdmin) requests.push(fetch('/api/settings/llm-providers'));
      const results = await Promise.all(requests);
      if (results.some((r) => !r.ok)) throw new Error('Failed to fetch');
      const [tplData, provData] = await Promise.all([
        results[0].json(),
        isAdmin ? results[1].json() : Promise.resolve([]),
      ]);
      setTemplates(tplData);
      setProviders(provData);
    } catch {
      toast({
        title: '加载失败',
        description: '无法获取提示词模板',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">暂无提示词模板</div>
    );
  }

  return (
    <div className="space-y-3 py-2">
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          providers={providers}
          onRefresh={fetchAll}
          isAdmin={isAdmin}
        />
      ))}
    </div>
  );
}
