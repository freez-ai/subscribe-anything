'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, Rss } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';

type SearchProviderType = 'none' | 'tavily' | 'serper';

interface SearchProviderSettings {
  provider: SearchProviderType;
  apiKey: string;
}

interface RssInstance {
  id: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
}

const defaultRssForm = { name: '', baseUrl: '' };

export default function SearchProviderForm() {
  const { toast } = useToast();

  // ── Search provider state ──────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<SearchProviderType>('none');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyFocused, setApiKeyFocused] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  // ── RSS instance state ─────────────────────────────────────────
  const [instances, setInstances] = useState<RssInstance[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [rssForm, setRssForm] = useState(defaultRssForm);
  const [rssSaving, setRssSaving] = useState(false);

  // ── Fetch both configs on mount ────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [searchRes, rssRes] = await Promise.all([
          fetch('/api/settings/search-provider'),
          fetch('/api/settings/rss-instances'),
        ]);
        if (searchRes.ok) {
          const data: SearchProviderSettings = await searchRes.json();
          setProvider(data.provider ?? 'none');
          setApiKey(data.apiKey ?? '');
          setHasExistingKey((data.provider ?? 'none') !== 'none');
        }
        if (rssRes.ok) {
          setInstances(await rssRes.json());
        }
      } catch {
        toast({ title: '加载失败', description: '无法获取配置', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const fetchRssInstances = () =>
    fetch('/api/settings/rss-instances')
      .then(r => r.json())
      .then(setInstances)
      .catch(() => {});

  // ── Search provider handlers ───────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/search-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: provider === 'none' ? '' : apiKey }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? '请求失败');
      }
      toast({ title: '保存成功', description: '搜索供应商配置已更新' });
    } catch (err) {
      toast({ title: '保存失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── RSS instance handlers ──────────────────────────────────────
  const openCreate = () => {
    setEditId(null);
    setRssForm(defaultRssForm);
    setDialogOpen(true);
  };

  const openEdit = (inst: RssInstance) => {
    setEditId(inst.id);
    setRssForm({ name: inst.name, baseUrl: inst.baseUrl });
    setDialogOpen(true);
  };

  const handleRssSave = async () => {
    if (!rssForm.name.trim() || !rssForm.baseUrl.trim()) return;
    setRssSaving(true);
    const payload = { name: rssForm.name.trim(), baseUrl: rssForm.baseUrl.trim().replace(/\/+$/, '') };
    try {
      if (editId) {
        await fetch(`/api/settings/rss-instances/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch('/api/settings/rss-instances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setDialogOpen(false);
      fetchRssInstances();
    } finally {
      setRssSaving(false);
    }
  };

  const handleActivate = async (id: string) => {
    await fetch(`/api/settings/rss-instances/${id}/activate`, { method: 'POST' });
    fetchRssInstances();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该 RSS 实例？')) return;
    await fetch(`/api/settings/rss-instances/${id}`, { method: 'DELETE' });
    fetchRssInstances();
  };

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="py-2 space-y-4">
      {/* Search provider section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">搜索供应商</CardTitle>
          <CardDescription>配置用于联网搜索的外部供应商</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search-provider">供应商</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as SearchProviderType)}>
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

      {/* RSS instances section */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">RSS 供应商</CardTitle>
              <CardDescription className="mt-1">
                配置 RSSHub 兼容实例，rssRadar 工具将使用激活的实例请求数据。
              </CardDescription>
            </div>
            <Button size="sm" onClick={openCreate} className="gap-1.5 flex-shrink-0">
              <Plus className="h-4 w-4" />
              添加实例
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {instances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center border rounded-lg">
              <Rss className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">暂无 RSS 实例</p>
              <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                添加实例
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {instances.map((inst) => (
                <div key={inst.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <Rss className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{inst.name}</span>
                      {inst.isActive && <Badge className="text-[10px] px-1.5 py-0">激活</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{inst.baseUrl}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!inst.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => handleActivate(inst.id)}
                      >
                        <Check className="h-3 w-3" />
                        激活
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(inst)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(inst.id)}
                      disabled={inst.isActive}
                      title={inst.isActive ? '激活中的实例不可删除' : undefined}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* RSS instance dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? '编辑 RSS 实例' : '添加 RSS 实例'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium block mb-1.5">名称</label>
              <Input
                placeholder="例如：我的 FreezeRSS"
                value={rssForm.name}
                onChange={(e) => setRssForm({ ...rssForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Base URL</label>
              <Input
                placeholder="https://rsshub.example.com"
                value={rssForm.baseUrl}
                onChange={(e) => setRssForm({ ...rssForm, baseUrl: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button
              onClick={handleRssSave}
              disabled={rssSaving || !rssForm.name.trim() || !rssForm.baseUrl.trim()}
            >
              {rssSaving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
