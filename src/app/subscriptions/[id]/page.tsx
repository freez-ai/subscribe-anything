'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, LayoutGrid, AlignJustify, ExternalLink,
  X, Loader2, BarChart2, CheckCheck, RefreshCw, CheckCircle2, Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { formatDistanceToNow } from '@/lib/utils/time';

/* ── Types ── */
interface Subscription {
  id: string; topic: string; criteria: string | null;
  isEnabled: boolean; unreadCount: number; totalCount: number;
}
interface CardItem {
  id: string; sourceId: string; sourceTitle: string;
  title: string; summary: string | null; thumbnailUrl: string | null;
  sourceUrl: string; meetsCriteriaFlag: boolean;
  criteriaResult?: 'matched' | 'not_matched' | 'invalid';
  metricValue?: string | null;
  readAt: string | null; createdAt: string; publishedAt: string | null;
}
interface Notification {
  id: string; type: string; title: string; body: string | null; isRead: boolean;
}
interface Source {
  id: string; title: string; isEnabled: boolean;
}

const PAGE_SIZE = 50;
const PULL_THRESHOLD = 70;

export default function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [sub, setSub] = useState<Subscription | null>(null);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [layout, setLayout] = useState<'masonry' | 'timeline'>('masonry');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [filterSources, setFilterSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);

  /* ── Fetch subscription ── */
  useEffect(() => {
    fetch(`/api/subscriptions/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setSub(d); else router.push('/subscriptions'); })
      .catch(() => router.push('/subscriptions'));
  }, [id, router]);

  /* ── Fetch notifications ── */
  const fetchNotifs = useCallback(() => {
    fetch(`/api/notifications?subscriptionId=${id}&isRead=false`)
      .then((r) => r.json()).then(setNotifs).catch(() => {});
  }, [id]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  /* ── Fetch sources for filter ── */
  useEffect(() => {
    fetch(`/api/sources?subscriptionId=${id}`)
      .then((r) => r.json())
      .then((d) => {
        const arr: Source[] = Array.isArray(d) ? d : (d.data ?? []);
        setFilterSources(arr.filter((s) => s.isEnabled));
      })
      .catch(() => {});
  }, [id]);

  /* ── Fetch cards ── */
  const loadMore = useCallback(async (currentOffset: number, replace = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) });
      if (selectedSourceId) params.set('sourceId', selectedSourceId);
      const res = await fetch(`/api/subscriptions/${id}/message-cards?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const items: CardItem[] = data.data;
      setCards((prev) => replace ? items : [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
      setOffset(currentOffset + items.length);
    } finally {
      setLoading(false);
    }
  }, [id, selectedSourceId]);

  useEffect(() => { loadMore(0, true); }, [loadMore]);

  /* ── Infinite scroll ── */
  useEffect(() => {
    if (!bottomRef.current || !hasMore || loading) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) loadMore(offset);
    }, { threshold: 0.1 });
    obs.observe(bottomRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, offset, loadMore]);

  /* ── Refresh all enabled sources ── */
  const handleRefreshAll = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/sources?subscriptionId=${id}`);
      if (!res.ok) return;
      const data = await res.json();
      const sources: Array<{ id: string; isEnabled: boolean }> = Array.isArray(data) ? data : (data.data ?? []);
      const enabled = sources.filter((s) => s.isEnabled);
      await Promise.all(
        enabled.map((s) => fetch(`/api/sources/${s.id}/trigger`, { method: 'POST' }))
      );
      await fetchNotifs();
      await loadMore(0, true);
      const subRes = await fetch(`/api/subscriptions/${id}`);
      if (subRes.ok) setSub(await subRes.json());
    } finally {
      setRefreshing(false);
    }
  }, [id, refreshing, loadMore, fetchNotifs]);

  /* ── Pull-to-refresh (mobile) ── */
  const handleTouchStart = (e: React.TouchEvent) => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling.current) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, PULL_THRESHOLD + 30));
    } else {
      isPulling.current = false;
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isPulling.current) return;
    isPulling.current = false;
    const dist = pullDistance;
    setPullDistance(0);
    touchStartY.current = 0;
    if (dist >= PULL_THRESHOLD && !refreshing) {
      handleRefreshAll();
    }
  };

  /* ── Actions ── */
  const handleCardClick = async (card: CardItem) => {
    if (!card.readAt) {
      await fetch(`/api/message-cards/${card.id}/read`, { method: 'POST' });
      setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, readAt: new Date().toISOString() } : c));
      setSub((prev) => prev ? { ...prev, unreadCount: Math.max(0, prev.unreadCount - 1) } : prev);
    }
    window.open(card.sourceUrl, '_blank', 'noopener,noreferrer');
  };

  const handleToggleEnabled = async (checked: boolean) => {
    if (!sub) return;
    setSub({ ...sub, isEnabled: checked });
    await fetch(`/api/subscriptions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled: checked }),
    });
  };

  const dismissNotif = async (notifId: string) => {
    await fetch(`/api/notifications/${notifId}/read`, { method: 'POST' });
    setNotifs((prev) => prev.filter((n) => n.id !== notifId));
  };

  const handleReadAll = async () => {
    await fetch(`/api/message-cards/read-all?subscriptionId=${id}`, { method: 'POST' });
    setCards((prev) => prev.map((c) => c.readAt ? c : { ...c, readAt: new Date().toISOString() }));
    setSub((prev) => prev ? { ...prev, unreadCount: 0 } : prev);
  };

  if (!sub) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* cards_collected: aggregate count for toast display */
  const cardsCollectedNotifs = notifs.filter((n) => n.type === 'cards_collected');
  const totalNewCards = cardsCollectedNotifs.reduce((sum, n) => {
    const m = n.title.match(/\d+/);
    return sum + (m ? parseInt(m[0]) : 0);
  }, 0);

  return (
    <div
      className="max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-6"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator (mobile only) */}
      {pullDistance > 0 && (
        <div
          className="flex md:hidden items-center justify-center text-muted-foreground text-sm gap-2 overflow-hidden transition-all"
          style={{ height: `${pullDistance}px` }}
        >
          <RefreshCw className={[
            'h-4 w-4 transition-transform duration-200',
            pullDistance >= PULL_THRESHOLD ? 'rotate-180 text-primary' : '',
          ].join(' ')} />
          <span>{pullDistance >= PULL_THRESHOLD ? '松开刷新' : '下拉刷新'}</span>
        </div>
      )}

      {refreshing && (
        <div className="flex md:hidden items-center justify-center py-2 mb-2 text-sm text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>采集中...</span>
        </div>
      )}

      {/* Back + header */}
      <div className="flex items-start gap-3 mb-4">
        {/* Back button: desktop only — mobile uses AppBar */}
        <Button variant="ghost" size="icon" asChild className="hidden md:flex -ml-2 mt-0.5 flex-shrink-0">
          <Link href="/subscriptions"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">{sub.topic}</h1>
            {sub.unreadCount > 0 && (
              <Badge className="bg-primary text-primary-foreground text-xs">{sub.unreadCount} 未读</Badge>
            )}
          </div>
          {sub.criteria && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">条件：{sub.criteria}</p>
          )}
          <p className="text-xs text-muted-foreground">共 {sub.totalCount} 条内容</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Switch checked={sub.isEnabled} onCheckedChange={handleToggleEnabled} />
          {/* Refresh: desktop only */}
          <Button
            variant="outline" size="sm"
            className="hidden md:flex gap-1.5"
            onClick={handleRefreshAll}
            disabled={refreshing}
          >
            <RefreshCw className={['h-4 w-4', refreshing ? 'animate-spin' : ''].join(' ')} />
            刷新
          </Button>
          {sub.unreadCount > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReadAll}>
              <CheckCheck className="h-4 w-4" />
              <span className="hidden sm:inline">全部已读</span>
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAnalyzeOpen(true)}>
            <BarChart2 className="h-4 w-4" />
            <span className="hidden sm:inline">分析</span>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/subscriptions/${id}/sources`}>订阅源</Link>
          </Button>
        </div>
      </div>

      {/* cards_collected toast — auto-dismisses after 3 s */}
      <CardsCollectedToast
        notifs={cardsCollectedNotifs}
        totalNewCards={totalNewCards}
        onDismiss={dismissNotif}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{cards.length} 条已加载</span>
        {/* Layout toggle: desktop only */}
        <div className="hidden md:flex items-center gap-1">
          <Button variant={layout === 'masonry' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7"
            onClick={() => setLayout('masonry')}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button variant={layout === 'timeline' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7"
            onClick={() => setLayout('timeline')}>
            <AlignJustify className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Source filter pills — visible when there are 2+ sources */}
      {filterSources.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 mb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setSelectedSourceId(null)}
            className={[
              'whitespace-nowrap flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors',
              !selectedSourceId
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            全部
          </button>
          {filterSources.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSourceId(s.id === selectedSourceId ? null : s.id)}
              className={[
                'whitespace-nowrap flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors',
                selectedSourceId === s.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      {cards.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground">暂无消息卡片</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            触发订阅源采集后内容会显示在这里
          </p>
          <Button variant="outline" size="sm" asChild className="mt-4">
            <Link href={`/subscriptions/${id}/sources`}>管理订阅源</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Mobile: always timeline */}
          <div className="flex flex-col gap-2 md:hidden">
            {cards.map((card) => (
              <TimelineCard key={card.id} card={card} onClick={() => handleCardClick(card)} />
            ))}
          </div>
          {/* Desktop: respect layout state */}
          {layout === 'masonry' ? (
            <div className="hidden md:flex gap-3">
              {[0, 1, 2].map((colIdx) => (
                <div key={colIdx} className="flex-1 flex flex-col gap-3">
                  {cards
                    .filter((_, i) => i % 3 === colIdx)
                    .map((card) => (
                      <MasonryCard key={card.id} card={card} onClick={() => handleCardClick(card)} />
                    ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="hidden md:flex flex-col gap-2">
              {cards.map((card) => (
                <TimelineCard key={card.id} card={card} onClick={() => handleCardClick(card)} />
              ))}
            </div>
          )}
        </>
      )}

      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <div ref={bottomRef} className="h-1" />

      {/* Analysis dialog */}
      {analyzeOpen && (
        <AnalyzeDialog subscriptionId={id} onClose={() => setAnalyzeOpen(false)} />
      )}
    </div>
  );
}

/* ── Cards Collected Toast ── */
function CardsCollectedToast({
  notifs,
  totalNewCards,
  onDismiss,
}: {
  notifs: Notification[];
  totalNewCards: number;
  onDismiss: (id: string) => Promise<void>;
}) {
  const [visible, setVisible] = useState(false);
  const notifsKey = notifs.map((n) => n.id).join(',');

  useEffect(() => {
    if (!notifsKey) return;
    setVisible(true);
    const ids = notifsKey.split(',');
    const timer = setTimeout(async () => {
      setVisible(false);
      await Promise.all(ids.map((nid) => onDismiss(nid)));
    }, 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifsKey]);

  if (!visible || notifs.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg px-4 py-2.5 text-sm bg-primary text-primary-foreground shadow-lg flex items-center gap-2 whitespace-nowrap">
      <Bell className="h-4 w-4 flex-shrink-0" />
      <span>新增 {totalNewCards} 条消息卡片</span>
    </div>
  );
}

/* ── Criteria Result Badge ── */
function CriteriaResultBadge({
  result,
  metricValue,
}: {
  result?: 'matched' | 'not_matched' | 'invalid';
  metricValue?: string | null;
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

/* ── Masonry Card ── */
function MasonryCard({ card, onClick }: { card: CardItem; onClick: () => void }) {
  const isUnread = !card.readAt;
  return (
    <button onClick={onClick} className={[
      'w-full text-left rounded-lg border transition-colors overflow-hidden flex flex-col bg-card hover:bg-accent/60',
      isUnread ? 'border-primary/40' : 'border-border',
    ].join(' ')}>
      {card.thumbnailUrl && (
        <img
          src={card.thumbnailUrl}
          alt=""
          className="w-full object-cover max-h-72"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="p-3 flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground truncate">{card.sourceTitle}</span>
        </div>
        <p className="text-sm leading-snug line-clamp-3">
          {card.title}
        </p>
        {card.summary && (
          <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed">{card.summary}</p>
        )}
        <div className="flex items-center mt-1">
          <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(card.publishedAt ?? card.createdAt)}</span>
          {card.criteriaResult && (
            <span className="ml-2">
              <CriteriaResultBadge result={card.criteriaResult} metricValue={card.metricValue} />
            </span>
          )}
          <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
        </div>
      </div>
    </button>
  );
}

/* ── Timeline Card ── */
function TimelineCard({ card, onClick }: { card: CardItem; onClick: () => void }) {
  const isUnread = !card.readAt;
  return (
    <button onClick={onClick} className={[
      'w-full text-left rounded-lg border p-3 transition-colors flex gap-3 items-start bg-card hover:bg-accent/60',
      isUnread ? 'border-primary/40' : 'border-border',
    ].join(' ')}>
      {card.thumbnailUrl && (
        <img src={card.thumbnailUrl} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] text-muted-foreground truncate">{card.sourceTitle}</span>
        </div>
        <p className="text-sm leading-snug line-clamp-2">
          {card.title}
        </p>
        {card.summary && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{card.summary}</p>}
        <div className="flex items-center mt-1 gap-2">
          <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(card.publishedAt ?? card.createdAt)}</span>
          {card.criteriaResult && (
            <CriteriaResultBadge result={card.criteriaResult} metricValue={card.metricValue} />
          )}
          <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
        </div>
      </div>
    </button>
  );
}

/* ── Analyze Dialog ── */
function AnalyzeDialog({ subscriptionId, onClose }: { subscriptionId: string; onClose: () => void }) {
  const [description, setDescription] = useState('');
  const [limit, setLimit] = useState(50);
  const [html, setHtml] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const start = async () => {
    setHtml('');
    setError('');
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`/api/subscriptions/${subscriptionId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description || undefined, limit }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        setError('请求失败，请重试');
        return;
      }

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (line.startsWith('data: ')) {
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === 'chunk') setHtml((prev) => prev + ev.html);
            } catch { /* ignore */ }
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') setError('连接中断，请重试');
    } finally {
      setStreaming(false);
    }
  };

  const openInNewWindow = () => {
    const fullHtml = `<html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:20px;line-height:1.6;color:#111}h2{font-size:1.1rem;font-weight:600;margin-top:1.5rem}ul{padding-left:1.5rem}li{margin-bottom:.25rem}strong{color:#333}</style></head><body>${html}</body></html>`;
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(fullHtml);
      win.document.close();
    }
  };

  const reset = () => {
    setHtml('');
    setError('');
  };

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const isIdle = !streaming && !html && !error;
  const isDone = !streaming && !!html;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-lg">AI 数据分析</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {/* Idle: form */}
          {isIdle && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-sm font-medium block mb-1.5">分析要求</label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  placeholder="例如：总结最近的趋势，哪些产品最受关注？"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium">分析数据量</label>
                <select
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                >
                  {[20, 50, 100].map((n) => <option key={n} value={n}>最近 {n} 条</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Streaming */}
          {streaming && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">AI 正在分析数据，请稍候...</p>
            </div>
          )}

          {/* Done */}
          {isDone && (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="font-medium">分析完成</p>
              <p className="text-sm text-muted-foreground">点击「查看」在新窗口中打开分析报告</p>
            </div>
          )}

          {/* Error */}
          {error && !streaming && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2 border-t pt-4">
          {isIdle && (
            <Button onClick={start} className="gap-2">
              <BarChart2 className="h-4 w-4" />
              开始分析
            </Button>
          )}
          {isDone && (
            <>
              <Button onClick={openInNewWindow} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                查看
              </Button>
              <Button variant="outline" onClick={reset}>重新分析</Button>
            </>
          )}
          {error && !streaming && (
            <Button variant="outline" onClick={reset}>重新分析</Button>
          )}
          <Button variant="ghost" onClick={onClose}>关闭</Button>
        </div>
      </div>
    </div>
  );
}
