'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Play, Wrench, Clock, X, Loader2, Trash2,
  CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, Code2, Copy, Check, Pencil, ScrollText,
  XOctagon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { CRON_PRESETS, validateCron } from '@/lib/utils/cron';
import { formatDistanceToNow } from '@/lib/utils/time';
import type { LLMCallInfo } from '@/lib/ai/client';
import LLMLogDialog from '@/components/debug/LLMLogDialog';

/* ── Types ── */
interface Source {
  id: string; subscriptionId: string;
  title: string; url: string; description: string | null;
  script: string; cronExpression: string;
  isEnabled: boolean; status: 'active' | 'failed' | 'disabled' | 'pending';
  lastRunAt: string | null; lastRunSuccess: boolean | null; lastError: string | null;
  nextRunAt: string | null; totalRuns: number; successRuns: number; itemsCollected: number;
}
interface Notification {
  id: string; type: string; title: string; body: string | null;
}
interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  nextRetryAt: number;
  lastError: string;
  collecting?: boolean;
}

export default function SourcesPage() {
  const { id } = useParams<{ id: string }>();
  const [sources, setSources] = useState<Source[]>([]);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [repairTarget, setRepairTarget] = useState<Source | null>(null);
  const [scriptTarget, setScriptTarget] = useState<Source | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [retryStates, setRetryStates] = useState<Record<string, RetryInfo>>({});
  const prevRetryIdsRef = useRef<Set<string>>(new Set());

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchSources = useCallback(async () => {
    const res = await fetch(`/api/sources?subscriptionId=${id}`);
    if (res.ok) {
      const d = await res.json();
      setSources(Array.isArray(d.data) ? d.data : []);
    }
    setLoading(false);
  }, [id]);

  const fetchNotifs = useCallback(async () => {
    const res = await fetch(`/api/notifications?subscriptionId=${id}&isRead=false`);
    if (res.ok) setNotifs(await res.json());
  }, [id]);

  useEffect(() => { fetchSources(); fetchNotifs(); }, [fetchSources, fetchNotifs]);

  // ── Retry state polling ───────────────────────────────────────────────────
  useEffect(() => {
    if (sources.length === 0) return;
    const ids = sources.map((s) => s.id).join(',');

    const poll = async () => {
      try {
        const res = await fetch(`/api/sources/retry-states?ids=${ids}`);
        if (!res.ok) return;
        const data: Record<string, RetryInfo> = await res.json();
        setRetryStates(data);

        // If a source was tracked before but no longer is, collection finished
        const currentIds = new Set(Object.keys(data));
        const prevIds = prevRetryIdsRef.current;
        const finishedIds: string[] = [];
        for (const pid of prevIds) {
          if (!currentIds.has(pid)) finishedIds.push(pid);
        }
        prevRetryIdsRef.current = currentIds;

        if (finishedIds.length > 0) {
          // Refetch sources to get updated stats
          const srcRes = await fetch(`/api/sources?subscriptionId=${id}`);
          if (srcRes.ok) {
            const d = await srcRes.json();
            const updated: Source[] = Array.isArray(d.data) ? d.data : [];
            setSources(updated);

            // Show toast for each finished source
            for (const fid of finishedIds) {
              const src = updated.find((s) => s.id === fid);
              if (src && src.lastRunSuccess) {
                showToast(`${src.title}：采集完成`);
              } else if (src && !src.lastRunSuccess) {
                showToast(`${src.title}：采集失败`, false);
              }
            }
          }
          fetchNotifs();
        }
      } catch { /* ignore */ }
    };

    poll();
    const timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, [sources.length, id, fetchNotifs]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissNotif = async (nid: string) => {
    await fetch(`/api/notifications/${nid}/read`, { method: 'POST' });
    setNotifs((p) => p.filter((n) => n.id !== nid));
  };

  const dismissBatch = async (ids: string[]) => {
    setNotifs((p) => p.filter((n) => !ids.includes(n.id)));
    await fetch('/api/notifications/read-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  };

  const handleToggle = async (src: Source, checked: boolean) => {
    setSources((p) => p.map((s) => s.id === src.id ? { ...s, isEnabled: checked } : s));
    await fetch(`/api/sources/${src.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled: checked }),
    });
  };

  const handleTrigger = async (src: Source) => {
    try {
      const res = await fetch(`/api/sources/${src.id}/trigger`, { method: 'POST' });
      const d = await res.json();
      if (d.error) { showToast(`触发失败: ${d.error}`, false); return; }
      showToast('已触发采集');
      // Collecting state will be picked up by retry-states polling
    } catch {
      showToast('网络错误', false);
    }
  };

  const handleCronChange = async (src: Source, cron: string) => {
    if (!validateCron(cron)) { showToast('无效的 Cron 表达式', false); return; }
    await fetch(`/api/sources/${src.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cronExpression: cron }),
    });
    fetchSources();
    showToast('采集频率已更新');
  };

  const handleTitleChange = async (src: Source, title: string) => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === src.title) return;
    await fetch(`/api/sources/${src.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    });
    fetchSources();
    showToast('名称已更新');
  };

  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);

  const handleDelete = async (src: Source) => {
    setDeleteTarget(null);
    setSources((p) => p.filter((s) => s.id !== src.id));
    try {
      const res = await fetch(`/api/sources/${src.id}`, { method: 'DELETE' });
      if (!res.ok) { showToast('删除失败', false); fetchSources(); return; }
      showToast('订阅源已删除');
    } catch {
      showToast('删除失败', false);
      fetchSources();
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" asChild className="-ml-2">
          <Link href={`/subscriptions/${id}`}><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <h1 className="text-xl font-semibold flex-1">订阅源管理</h1>
        <span className="text-sm text-muted-foreground">{sources.length} 个源</span>
      </div>

      {/* Notification banners — grouped by type */}
      <NotificationBanners
        notifs={notifs.filter((n) => n.type !== 'cards_collected')}
        onDismiss={dismissNotif}
        onDismissBatch={dismissBatch}
      />

      {/* Empty state */}
      {sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground">暂无订阅源</p>
        </div>
      ) : (
        /* Desktop: grid, Mobile: accordion */
        <>
          <div className="hidden md:grid md:grid-cols-2 gap-3">
            {sources.map((src) => (
              <SourceCard key={src.id} src={src}
                retryState={retryStates[src.id]}
                onToggle={(c) => handleToggle(src, c)}
                onTrigger={() => handleTrigger(src)}
                onCronChange={(c) => handleCronChange(src, c)}
                onTitleChange={(t) => handleTitleChange(src, t)}
                onRepair={() => setRepairTarget(src)}
                onViewScript={() => setScriptTarget(src)}
                onDelete={() => setDeleteTarget(src)}
              />
            ))}
          </div>
          <div className="md:hidden flex flex-col gap-2">
            {sources.map((src) => (
              <SourceAccordion key={src.id} src={src}
                retryState={retryStates[src.id]}
                onToggle={(c) => handleToggle(src, c)}
                onTrigger={() => handleTrigger(src)}
                onCronChange={(c) => handleCronChange(src, c)}
                onTitleChange={(t) => handleTitleChange(src, t)}
                onRepair={() => setRepairTarget(src)}
                onViewScript={() => setScriptTarget(src)}
                onDelete={() => setDeleteTarget(src)}
              />
            ))}
          </div>
        </>
      )}

      {/* Repair dialog */}
      {repairTarget && (
        <RepairDialog
          source={repairTarget}
          onClose={() => { setRepairTarget(null); fetchSources(); }}
          showToast={showToast}
        />
      )}

      {/* Script view dialog */}
      {scriptTarget && (
        <ScriptViewDialog
          source={scriptTarget}
          onClose={() => setScriptTarget(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50">
          <div className="bg-background w-full md:max-w-sm rounded-t-2xl md:rounded-xl shadow-xl p-6">
            <h3 className="font-semibold mb-2">确认删除</h3>
            <p className="text-sm text-muted-foreground mb-4">
              确定要删除订阅源「{deleteTarget.title}」吗？相关的采集数据将一并删除，此操作不可撤销。
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteTarget)}>删除</Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={[
          'fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg',
          toast.ok ? 'bg-green-600' : 'bg-destructive',
        ].join(' ')}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ── Notification Banners (grouped) ── */
function NotificationBanners({ notifs, onDismiss, onDismissBatch }: {
  notifs: Notification[];
  onDismiss: (id: string) => void;
  onDismissBatch: (ids: string[]) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (notifs.length === 0) return null;

  // Group: source_failed in one group, everything else in another
  const groups: Record<string, Notification[]> = {};
  for (const n of notifs) {
    const key = n.type === 'source_failed' ? 'source_failed' : 'source_ok';
    (groups[key] ??= []).push(n);
  }

  const groupMeta: Record<string, { label: string; style: string }> = {
    source_failed: {
      label: '个订阅源采集失败',
      style: 'border-destructive/30 bg-destructive/10 text-destructive',
    },
    source_ok: {
      label: '个订阅源状态更新',
      style: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400',
    },
  };

  return (
    <>
      {Object.entries(groups).map(([key, items]) => {
        const meta = groupMeta[key];
        if (items.length === 1) {
          // Single notification — render inline
          const n = items[0];
          return (
            <div key={n.id} className={`flex items-start gap-3 rounded-lg border px-4 py-3 mb-2 text-sm ${meta.style}`}>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="text-xs mt-0.5 opacity-80">{n.body}</p>}
              </div>
              <button onClick={() => onDismiss(n.id)} className="opacity-60 hover:opacity-100 flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        }

        // Multiple notifications — collapsible group
        const isOpen = expanded[key] ?? false;
        return (
          <div key={key} className={`rounded-lg border mb-2 text-sm ${meta.style}`}>
            {/* Group header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                className="flex-1 min-w-0 flex items-center gap-2 text-left"
                onClick={() => setExpanded((p) => ({ ...p, [key]: !p[key] }))}
              >
                {isOpen ? <ChevronUp className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
                <span className="font-medium">{items.length} {meta.label}</span>
              </button>
              <button
                onClick={() => onDismissBatch(items.map((n) => n.id))}
                className="text-xs opacity-70 hover:opacity-100 flex-shrink-0 flex items-center gap-1"
              >
                <XOctagon className="h-3.5 w-3.5" />
                全部关闭
              </button>
            </div>

            {/* Expanded list */}
            {isOpen && (
              <div className="border-t border-current/10 px-4 pb-2">
                {items.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 py-2 border-b border-current/5 last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{n.title}</p>
                      {n.body && <p className="text-xs mt-0.5 opacity-80">{n.body}</p>}
                    </div>
                    <button onClick={() => onDismiss(n.id)} className="opacity-60 hover:opacity-100 flex-shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ── Status badge ── */
function StatusBadge({ status, retryState }: { status: Source['status']; retryState?: RetryInfo }) {
  if (retryState) {
    return (
      <Badge variant="outline" className="text-xs bg-orange-500/15 text-orange-700 border-orange-500/30">
        采集中
      </Badge>
    );
  }
  const map = {
    active: { label: '运行中', cls: 'bg-green-500/15 text-green-700 border-green-500/30' },
    failed: { label: '失败', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
    disabled: { label: '已禁用', cls: 'bg-muted text-muted-foreground' },
    pending: { label: '待运行', cls: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30' },
  };
  const { label, cls } = map[status] ?? map.pending;
  return <Badge variant="outline" className={`text-xs ${cls}`}>{label}</Badge>;
}

/* ── Cron selector ── */
function CronSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const preset = CRON_PRESETS.find((p) => p.value === value);

  return (
    <div className="flex flex-col gap-1.5">
      <select
        className="rounded-md border bg-background px-2 py-1 text-xs w-full"
        value={preset ? value : 'custom'}
        onChange={(e) => {
          if (e.target.value === 'custom') { setShowCustom(true); }
          else { setShowCustom(false); onChange(e.target.value); }
        }}
      >
        {CRON_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        <option value="custom">自定义…</option>
      </select>
      {(showCustom || !preset) && (
        <div className="flex gap-1">
          <input
            className="flex-1 rounded-md border bg-background px-2 py-1 text-xs font-mono"
            placeholder="cron 表达式"
            defaultValue={!preset ? value : ''}
            onChange={(e) => setCustom(e.target.value)}
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => onChange(custom)}>确定</Button>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground font-mono">{value}</p>
    </div>
  );
}

/* ── Retry countdown banner ── */
function RetryBanner({ retryState }: { retryState: RetryInfo }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // First attempt — currently collecting, no retry yet
  if (retryState.attempt === 0) {
    return (
      <div className="text-xs bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded px-2 py-1.5 flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
        正在采集...
      </div>
    );
  }

  // Retry scheduled — show countdown or "executing"
  const remaining = Math.max(0, Math.ceil((retryState.nextRetryAt - now) / 1000));
  return (
    <div className="text-xs bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded px-2 py-1.5 flex items-center gap-1.5">
      <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
      {retryState.collecting
        ? `正在第 ${retryState.attempt}/${retryState.maxAttempts} 次重试...`
        : remaining > 0
          ? `采集失败，${remaining}s 后第 ${retryState.attempt}/${retryState.maxAttempts} 次重试...`
          : `正在第 ${retryState.attempt}/${retryState.maxAttempts} 次重试...`}
    </div>
  );
}

/* ── Desktop Source Card ── */
function SourceCard({ src, retryState, onToggle, onTrigger, onCronChange, onTitleChange, onRepair, onViewScript, onDelete }: {
  src: Source; retryState?: RetryInfo; onToggle: (v: boolean) => void;
  onTrigger: () => void; onCronChange: (v: string) => void;
  onTitleChange: (v: string) => void; onRepair: () => void; onViewScript: () => void; onDelete: () => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingValue, setEditingValue] = useState('');

  const startEdit = () => { setEditingValue(src.title); setEditingTitle(true); };
  const commitEdit = () => { onTitleChange(editingValue); setEditingTitle(false); };

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
      {/* Title row */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                className="flex-1 min-w-0 rounded border bg-background px-1.5 py-0.5 text-sm font-semibold"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
              />
            ) : (
              <>
                <a href={src.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-semibold hover:underline line-clamp-1 flex-1 min-w-0">{src.title}</a>
                <button onClick={startEdit} className="text-muted-foreground hover:text-foreground flex-shrink-0" title="编辑名称">
                  <Pencil className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
          <a href={src.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-muted-foreground truncate mt-0.5 hover:underline underline-offset-2 block">{src.url}</a>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Switch checked={src.isEnabled} onCheckedChange={onToggle} />
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors" title="删除订阅源">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Status + stats */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={src.status} retryState={retryState} />
        <span className="text-xs text-muted-foreground">运行 {src.totalRuns} 次 · 采集 {src.itemsCollected} 条</span>
      </div>

      {retryState && <RetryBanner retryState={retryState} />}

      {src.lastError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1 line-clamp-2">{src.lastError}</p>
      )}

      {/* Time info */}
      <div className="text-xs text-muted-foreground space-y-0.5">
        {src.lastRunAt && <p>上次运行：{formatDistanceToNow(src.lastRunAt)}</p>}
        {src.nextRunAt && <p>下次运行：{formatDistanceToNow(src.nextRunAt)}</p>}
      </div>

      {/* Cron */}
      <div>
        <p className="text-xs font-medium mb-1 flex items-center gap-1"><Clock className="h-3 w-3" />采集频率</p>
        <CronSelector value={src.cronExpression} onChange={onCronChange} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t">
        <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={onTrigger}>
          <Play className="h-3.5 w-3.5" />立即采集
        </Button>
        {(src.status === 'failed' || (src.status === 'pending' && !src.script)) && (
          <Button variant="destructive" size="sm" className="gap-1 flex-1" onClick={onRepair}>
            <Wrench className="h-3.5 w-3.5" />AI 修复
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1 px-2" onClick={onViewScript} title="查看脚本">
          <Code2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ── Mobile Accordion ── */
function SourceAccordion({ src, retryState, onToggle, onTrigger, onCronChange, onTitleChange, onRepair, onViewScript, onDelete }: {
  src: Source; retryState?: RetryInfo; onToggle: (v: boolean) => void;
  onTrigger: () => void; onCronChange: (v: string) => void;
  onTitleChange: (v: string) => void; onRepair: () => void; onViewScript: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingValue, setEditingValue] = useState('');

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingValue(src.title);
    setEditingTitle(true);
  };
  const commitEdit = () => { onTitleChange(editingValue); setEditingTitle(false); };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="w-full flex items-center gap-3 px-4 py-3">
        <button className="flex-1 min-w-0 text-left" onClick={() => !editingTitle && setOpen((v) => !v)}>
          {editingTitle ? (
            <input
              autoFocus
              className="w-full rounded border bg-background px-1.5 py-0.5 text-sm font-medium"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={commitEdit}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
            />
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-sm font-medium truncate flex-1 min-w-0">{src.title}</p>
              <div onClick={startEdit} className="text-muted-foreground hover:text-foreground flex-shrink-0 cursor-pointer" title="编辑名称">
                <Pencil className="h-3 w-3" />
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <StatusBadge status={src.status} retryState={retryState} />
            <span className="text-xs text-muted-foreground">{src.itemsCollected} 条</span>
          </div>
        </button>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Switch checked={src.isEnabled} onCheckedChange={onToggle} />
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors" title="删除订阅源">
            <Trash2 className="h-4 w-4" />
          </button>
          <button onClick={() => !editingTitle && setOpen((v) => !v)} className="text-muted-foreground">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t">
          <div className="flex items-center justify-between pt-3">
            <a href={src.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline underline-offset-2 truncate flex-1 min-w-0 mr-2">
              {src.url.slice(0, 40)}{src.url.length > 40 ? '…' : ''}
            </a>
          </div>

          {retryState && <RetryBanner retryState={retryState} />}

          {src.lastError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{src.lastError}</p>
          )}

          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>运行 {src.totalRuns} 次 · 成功 {src.successRuns} 次 · 采集 {src.itemsCollected} 条</p>
            {src.lastRunAt && <p>上次：{formatDistanceToNow(src.lastRunAt)}</p>}
            {src.nextRunAt && <p>下次：{formatDistanceToNow(src.nextRunAt)}</p>}
          </div>

          <div>
            <p className="text-xs font-medium mb-1">采集频率</p>
            <CronSelector value={src.cronExpression} onChange={onCronChange} />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1 flex-1" onClick={onTrigger}>
              <Play className="h-3.5 w-3.5" />立即采集
            </Button>
            {(src.status === 'failed' || (src.status === 'pending' && !src.script)) && (
              <Button variant="destructive" size="sm" className="gap-1 flex-1" onClick={onRepair}>
                <Wrench className="h-3.5 w-3.5" />AI 修复
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1 px-2" onClick={onViewScript} title="查看脚本">
              <Code2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Repair Dialog ── */
function RepairDialog({ source, onClose, showToast }: {
  source: Source; onClose: () => void; showToast: (m: string, ok?: boolean) => void;
}) {
  const [messages, setMessages] = useState<{ role: 'system' | 'user'; text: string }[]>([]);
  const [repairedScript, setRepairedScript] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [applying, setApplying] = useState(false);
  const [llmCalls, setLlmCalls] = useState<LLMCallInfo[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const countedCallsRef = useRef<Set<number>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setMessages([]);
    setLlmCalls([]);
    setTotalTokens(0);
    setDone(false);
    setRepairedScript(null);
    countedCallsRef.current.clear();
    runRepair(ctrl);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const addMsg = (text: string) =>
    setMessages((p) => [...p, { role: 'system', text }]);

  const runRepair = async (ctrl: AbortController) => {
    addMsg(`开始修复：${source.title}`);
    try {
      const res = await fetch(`/api/sources/${source.id}/repair`, {
        method: 'POST', signal: ctrl.signal,
      });
      if (!res.ok) { addMsg('修复请求失败'); setDone(true); return; }

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'progress') addMsg(ev.message);
            else if (ev.type === 'success') {
              setRepairedScript(ev.script);
              addMsg('✅ 修复成功！请确认后应用。');
            } else if (ev.type === 'failed') {
              addMsg(`❌ 修复失败：${ev.reason ?? '未知原因'}`);
              if (ev.script) setRepairedScript(ev.script);
            } else if (ev.type === 'llm_call') {
              const info = ev as unknown as LLMCallInfo;
              setLlmCalls((prev) => {
                const existingIdx = prev.findIndex((c) => c.callIndex === info.callIndex);
                if (existingIdx >= 0) {
                  const next = [...prev];
                  next[existingIdx] = info;
                  return next;
                }
                return [...prev, info];
              });
              if (!info.streaming && info.usage?.total && !countedCallsRef.current.has(info.callIndex)) {
                countedCallsRef.current.add(info.callIndex);
                setTotalTokens((prev) => prev + info.usage!.total);
              }
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') addMsg('连接中断');
    } finally {
      if (!ctrl.signal.aborted) setDone(true);
    }
  };

  const applyFix = async () => {
    if (!repairedScript) return;
    setApplying(true);
    try {
      await fetch(`/api/sources/${source.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: repairedScript, status: 'active', lastError: null }),
      });
      showToast('修复已应用，订阅源已恢复');
      onClose();
    } catch {
      showToast('应用失败', false);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50">
      <div className="bg-background w-full md:max-w-lg rounded-t-2xl md:rounded-xl shadow-xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold">AI 智能修复</h2>
            <p className="text-xs text-muted-foreground truncate max-w-xs">{source.title}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {messages.map((m, i) => (
            <div key={i} className="flex gap-2 items-start text-sm">
              {m.text.startsWith('✅') ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                : m.text.startsWith('❌') ? <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  : <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />}
              <p className="text-muted-foreground">{m.text}</p>
            </div>
          ))}
          {!done && llmCalls.length > 0 && (
            <div className="flex justify-center py-1">
              <button
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowLog(true)}
              >
                <ScrollText className="h-3 w-3" />
                查看 LLM 调用日志（{totalTokens.toLocaleString()} tokens）
              </button>
            </div>
          )}
        </div>

        {/* LLM log button (done) */}
        {done && llmCalls.length > 0 && (
          <div className="px-5 pb-1 flex justify-center">
            <button
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowLog(true)}
            >
              <ScrollText className="h-3 w-3" />
              查看 LLM 调用日志（{totalTokens.toLocaleString()} tokens）
            </button>
          </div>
        )}

        {/* Actions — always visible */}
        <div className="px-5 py-4 border-t flex gap-2">
          {!done ? (
            <Button disabled className="flex-1 gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              修复中…
            </Button>
          ) : repairedScript ? (
            <Button onClick={applyFix} disabled={applying} className="flex-1 gap-2">
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              应用修复
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose} className={(!done || repairedScript) ? '' : 'flex-1'}>
            {!done ? '取消' : repairedScript ? '取消' : '关闭'}
          </Button>
        </div>
      </div>

      {/* LLM log dialog */}
      {showLog && (
        <LLMLogDialog
          sourceTitle={source.title}
          calls={llmCalls}
          totalTokens={totalTokens}
          onClose={() => setShowLog(false)}
        />
      )}
    </div>
  );
}

/* ── Script View Dialog ── */
function ScriptViewDialog({ source, onClose }: { source: Source; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState('');
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    import('highlight.js/lib/core').then(async ({ default: hljs }) => {
      const js = (await import('highlight.js/lib/languages/javascript')).default;
      hljs.registerLanguage('javascript', js);
      const result = hljs.highlight(source.script, { language: 'javascript' });
      setHighlighted(result.value);
    });
  }, [source.script]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(source.script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* highlight.js theme injected inline — github-dark style */}
      <style>{`
        .hljs { background: transparent; color: #e6edf3; }
        .hljs-comment, .hljs-quote { color: #8b949e; font-style: italic; }
        .hljs-keyword, .hljs-selector-tag { color: #ff7b72; }
        .hljs-string, .hljs-attr { color: #a5d6ff; }
        .hljs-number, .hljs-literal { color: #79c0ff; }
        .hljs-title, .hljs-name, .hljs-selector-id { color: #d2a8ff; }
        .hljs-built_in, .hljs-builtin-name { color: #ffa657; }
        .hljs-variable, .hljs-template-variable { color: #ffa657; }
        .hljs-params { color: #e6edf3; }
        .hljs-operator, .hljs-punctuation { color: #e6edf3; }
        .hljs-function .hljs-title { color: #d2a8ff; }
        .hljs-property { color: #79c0ff; }
        .hljs-regexp { color: #a5d6ff; }
      `}</style>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50">
        <div className="bg-background w-full md:max-w-2xl rounded-t-2xl md:rounded-xl shadow-xl flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2 min-w-0">
              <Code2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold text-sm">采集脚本</h2>
                <p className="text-xs text-muted-foreground truncate max-w-xs">{source.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleCopy}>
                {copied
                  ? <><Check className="h-3.5 w-3.5 text-green-600" />已复制</>
                  : <><Copy className="h-3.5 w-3.5" />复制</>}
              </Button>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Code block */}
          <div className="flex-1 overflow-auto">
            <pre className="min-h-full m-0 p-5 text-xs leading-relaxed font-mono bg-[#0d1117] rounded-b-xl md:rounded-b-xl">
              {highlighted
                ? <code ref={codeRef} className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
                : <code className="text-[#e6edf3]">{source.script}</code>}
            </pre>
          </div>
        </div>
      </div>
    </>
  );
}
