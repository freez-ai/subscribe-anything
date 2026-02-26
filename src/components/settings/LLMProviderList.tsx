'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Pencil, Plus, Trash2, Zap, ZapOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import LLMProviderForm, { type FormState } from './LLMProviderForm';

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  modelId: string;
  headers?: string | null;
  isActive: boolean;
  totalTokensUsed: number;
}

export default function LLMProviderList() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [copyPrefill, setCopyPrefill] = useState<FormState | undefined>(undefined);
  const [activating, setActivating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/llm-providers');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setProviders(data);
    } catch {
      toast({
        title: '加载失败',
        description: '无法获取供应商列表',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleActivate = async (provider: Provider) => {
    setActivating(provider.id);
    try {
      const res = await fetch(`/api/settings/llm-providers/${provider.id}/activate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to activate');
      toast({ title: '激活成功', description: `${provider.name} 已设为激活供应商` });
      await fetchProviders();
    } catch {
      toast({ title: '激活失败', variant: 'destructive' });
    } finally {
      setActivating(null);
    }
  };

  const handleDelete = async (provider: Provider) => {
    if (!window.confirm(`确定要删除供应商"${provider.name}"吗？此操作不可撤销。`)) return;

    setDeleting(provider.id);
    try {
      const res = await fetch(`/api/settings/llm-providers/${provider.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast({ title: '删除成功', description: `${provider.name} 已删除` });
      await fetchProviders();
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  const handleEdit = (provider: Provider) => {
    setCopyPrefill(undefined);
    setEditingProvider(provider);
    setFormOpen(true);
  };

  const handleCopy = async (provider: Provider) => {
    try {
      const res = await fetch(`/api/settings/llm-providers/${provider.id}`);
      if (!res.ok) throw new Error('Failed to fetch provider');
      const data = await res.json();
      setCopyPrefill({
        name: `复制自 ${data.name}`,
        baseUrl: data.baseUrl ?? '',
        apiKey: data.apiKey ?? '',
        modelId: data.modelId ?? '',
        headers: data.headers ?? '',
      });
      setEditingProvider(null);
      setFormOpen(true);
    } catch {
      toast({ title: '复制失败', description: '无法获取供应商详情', variant: 'destructive' });
    }
  };

  const handleAddNew = () => {
    setCopyPrefill(undefined);
    setEditingProvider(null);
    setFormOpen(true);
  };

  const handleFormOpenChange = (open: boolean) => {
    setFormOpen(open);
    if (!open) setCopyPrefill(undefined);
  };

  const handleFormSuccess = () => {
    fetchProviders();
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      {providers.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          暂无供应商，点击下方按钮添加
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => (
            <Card key={provider.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">{provider.name}</CardTitle>
                      <span className="text-sm text-muted-foreground font-mono">
                        {provider.modelId}
                      </span>
                      {provider.isActive && (
                        <Badge variant="default" className="text-xs">
                          激活
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1 truncate max-w-xs text-xs">
                      {provider.baseUrl}
                    </CardDescription>
                    {provider.totalTokensUsed > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        已消耗 {provider.totalTokensUsed.toLocaleString()} tokens
                      </p>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardFooter className="gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant={provider.isActive ? 'secondary' : 'default'}
                  onClick={() => handleActivate(provider)}
                  disabled={provider.isActive || activating === provider.id}
                >
                  {provider.isActive ? (
                    <>
                      <Zap className="h-3.5 w-3.5 mr-1" />
                      已激活
                    </>
                  ) : (
                    <>
                      <ZapOff className="h-3.5 w-3.5 mr-1" />
                      {activating === provider.id ? '激活中...' : '激活'}
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleEdit(provider)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  编辑
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopy(provider)}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  复制
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(provider)}
                  disabled={provider.isActive || deleting === provider.id}
                  title={provider.isActive ? '激活中的供应商不可删除' : undefined}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {deleting === provider.id ? '删除中...' : '删除'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Button onClick={handleAddNew} className="w-full" variant="outline">
        <Plus className="h-4 w-4 mr-2" />
        添加供应商
      </Button>

      <LLMProviderForm
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        provider={editingProvider}
        prefillData={copyPrefill}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
