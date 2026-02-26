'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

type SearchProviderType = 'none' | 'tavily' | 'serper';

interface SearchProviderSettings {
  provider: SearchProviderType;
  apiKey: string;
}

export default function SearchProviderForm() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<SearchProviderType>('none');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyFocused, setApiKeyFocused] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/settings/search-provider');
        if (!res.ok) throw new Error('Failed to fetch');
        const data: SearchProviderSettings = await res.json();
        setProvider(data.provider ?? 'none');
        setApiKey(data.apiKey ?? '');
        // Track whether a key was previously saved (provider is set, key comes back masked/empty)
        setHasExistingKey((data.provider ?? 'none') !== 'none');
      } catch {
        toast({
          title: '加载失败',
          description: '无法获取搜索供应商配置',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: SearchProviderSettings = {
        provider,
        apiKey: provider === 'none' ? '' : apiKey,
      };

      const res = await fetch('/api/settings/search-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? '请求失败');
      }

      toast({ title: '保存成功', description: '搜索供应商配置已更新' });
    } catch (err) {
      toast({
        title: '保存失败',
        description: err instanceof Error ? err.message : '未知错误',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
    );
  }

  return (
    <div className="py-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">搜索供应商</CardTitle>
          <CardDescription>配置用于联网搜索的外部供应商</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search-provider">供应商</Label>
            <Select
              value={provider}
              onValueChange={(value) => setProvider(value as SearchProviderType)}
            >
              <SelectTrigger id="search-provider">
                <SelectValue placeholder="选择供应商" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不使用</SelectItem>
                <SelectItem value="tavily">Tavily</SelectItem>
                <SelectItem value="serper">Serper</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {provider !== 'none' && (
            <div className="space-y-2">
              <Label htmlFor="search-api-key">API Key</Label>
              <Input
                id="search-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  hasExistingKey && !apiKey
                    ? (apiKeyFocused ? '不修改请留空' : '••••••••')
                    : '输入 API Key'
                }
                autoComplete="off"
                onFocus={() => setApiKeyFocused(true)}
                onBlur={() => setApiKeyFocused(false)}
              />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
