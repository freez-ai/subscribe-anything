'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, Rss } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface RssInstance {
  id: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
}

const defaultForm = { name: '', baseUrl: '' };

export default function RssInstanceList() {
  const [instances, setInstances] = useState<RssInstance[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const fetchAll = () =>
    fetch('/api/settings/rss-instances')
      .then((r) => r.json())
      .then(setInstances)
      .catch(() => {});

  useEffect(() => { fetchAll(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm(defaultForm);
    setOpen(true);
  };

  const openEdit = (inst: RssInstance) => {
    setEditId(inst.id);
    setForm({ name: inst.name, baseUrl: inst.baseUrl });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.baseUrl.trim()) return;
    setSaving(true);
    const payload = { name: form.name.trim(), baseUrl: form.baseUrl.trim().replace(/\/+$/, '') };
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
      setOpen(false);
      fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (id: string) => {
    await fetch(`/api/settings/rss-instances/${id}/activate`, { method: 'POST' });
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该 RSS 实例？')) return;
    await fetch(`/api/settings/rss-instances/${id}`, { method: 'DELETE' });
    fetchAll();
  };

  return (
    <div className="space-y-3 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          配置 RSSHub 兼容实例，rssRadar 工具将使用激活的实例请求数据。
        </p>
        <Button size="sm" onClick={openCreate} className="gap-1.5 flex-shrink-0">
          <Plus className="h-4 w-4" />
          添加实例
        </Button>
      </div>

      {instances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
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
            <div
              key={inst.id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <Rss className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{inst.name}</span>
                  {inst.isActive && (
                    <Badge className="text-[10px] px-1.5 py-0">激活</Badge>
                  )}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? '编辑 RSS 实例' : '添加 RSS 实例'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium block mb-1.5">名称</label>
              <Input
                placeholder="例如：我的 FreezeRSS"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Base URL</label>
              <Input
                placeholder="https://rsshub.example.com"
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.baseUrl.trim()}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
