'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

interface ProviderData {
  id: string;
  name: string;
  baseUrl: string;
  modelId: string;
  headers?: string | null;
}

export interface FormState {
  name: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  headers: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider?: ProviderData | null;
  /** Pre-fill form for copy mode (new provider, not saved yet). Ignored when editing. */
  prefillData?: FormState;
  onSuccess: () => void;
}

const defaultForm: FormState = {
  name: '',
  baseUrl: '',
  apiKey: '',
  modelId: '',
  headers: '',
};

export default function LLMProviderForm({ open, onOpenChange, provider, prefillData, onSuccess }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [apiKeyFocused, setApiKeyFocused] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(defaultForm);
      return;
    }

    if (provider?.id) {
      // Edit mode: fetch full provider data including apiKey
      setFetching(true);
      fetch(`/api/settings/llm-providers/${provider.id}`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch provider');
          return res.json();
        })
        .then((data) => {
          setForm({
            name: data.name ?? '',
            baseUrl: data.baseUrl ?? '',
            apiKey: data.apiKey ?? '',
            modelId: data.modelId ?? '',
            headers: data.headers ?? '',
          });
        })
        .catch(() => {
          toast({ title: '加载失败', description: '无法获取供应商详情', variant: 'destructive' });
        })
        .finally(() => setFetching(false));
    } else if (prefillData) {
      // Copy mode: pre-fill from copied provider
      setForm(prefillData);
    } else {
      setForm(defaultForm);
    }
  }, [open, provider?.id, prefillData]);

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const body: Record<string, unknown> = {
      name: form.name,
      baseUrl: form.baseUrl.replace(/\/+$/, ''),
      apiKey: form.apiKey,
      modelId: form.modelId,
    };
    if (form.headers.trim()) {
      body.headers = form.headers.trim();
    }

    setLoading(true);
    try {
      const url = provider?.id
        ? `/api/settings/llm-providers/${provider.id}`
        : '/api/settings/llm-providers';
      const method = provider?.id ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? '请求失败');
      }

      toast({
        title: provider?.id ? '更新成功' : '添加成功',
        description: provider?.id ? '供应商已更新' : '供应商已添加',
      });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: '操作失败',
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const isEditMode = !!provider?.id;
  const isCopyMode = !isEditMode && !!prefillData;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? '编辑供应商' : isCopyMode ? '复制供应商' : '添加供应商'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? '修改 LLM 供应商配置'
              : isCopyMode
              ? '基于已有供应商创建新供应商（保存后才会生效）'
              : '添加一个新的 LLM 供应商'}
          </DialogDescription>
        </DialogHeader>

        {fetching ? (
          <div className="py-6 text-center text-sm text-muted-foreground">加载中...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="OpenAI"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                value={form.baseUrl}
                onChange={(e) => handleChange('baseUrl', e.target.value)}
                placeholder="https://api.openai.com/v1"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">
                API Key
                {isEditMode && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    （留空则保持不变）
                  </span>
                )}
              </Label>
              <Input
                id="apiKey"
                type="password"
                value={form.apiKey}
                onChange={(e) => handleChange('apiKey', e.target.value)}
                placeholder={
                  isEditMode
                    ? (apiKeyFocused ? '不修改请留空' : '••••••••')
                    : 'sk-...'
                }
                autoComplete="off"
                required={!isEditMode}
                onFocus={() => setApiKeyFocused(true)}
                onBlur={() => setApiKeyFocused(false)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="modelId">模型 ID</Label>
              <Input
                id="modelId"
                value={form.modelId}
                onChange={(e) => handleChange('modelId', e.target.value)}
                placeholder="gpt-4o"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="headers">
                自定义请求头{' '}
                <span className="text-muted-foreground font-normal">(可选)</span>
              </Label>
              <Textarea
                id="headers"
                value={form.headers}
                onChange={(e) => handleChange('headers', e.target.value)}
                placeholder={'{"X-Custom": "value"}'}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                取消
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
