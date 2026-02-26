'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, CheckCheck, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { formatDistanceToNow } from '@/lib/utils/time';

interface MessageCardItem {
  id: string;
  subscriptionId: string;
  subscriptionTopic: string;
  sourceId: string;
  sourceName: string;
  title: string;
  summary: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string;
  publishedAt: string | null;
  meetsCriteriaFlag: boolean;
  criteriaResult?: 'matched' | 'not_matched' | 'invalid';
  metricValue?: string | null;
  readAt: string | null;
  createdAt: string;
}

const PAGE_SIZE = 50;

export default function MessagesPage() {
  const { toast } = useToast();
  const [cards, setCards] = useState<MessageCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const { count, refresh } = useUnreadCount();
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async (currentOffset: number, replace = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/message-cards?status=unread&limit=${PAGE_SIZE}&offset=${currentOffset}`);
      if (!res.ok) return;
      const data = await res.json();
      const items: MessageCardItem[] = data.data;
      setCards((prev) => replace ? items : [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
      setOffset(currentOffset + items.length);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMore(0, true);
  }, [loadMore]);

  // Infinite scroll observer
  useEffect(() => {
    if (!bottomRef.current || !hasMore || loading) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore(offset);
    }, { threshold: 0.1 });
    obs.observe(bottomRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, offset, loadMore]);

  const handleCardClick = async (card: MessageCardItem) => {
    // Mark as read
    await fetch(`/api/message-cards/${card.id}/read`, { method: 'POST' });
    // Remove from list optimistically
    setCards((prev) => prev.filter((c) => c.id !== card.id));
    refresh();
    // Open URL in new tab
    window.open(card.sourceUrl, '_blank', 'noopener,noreferrer');
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      const res = await fetch('/api/message-cards/read-all', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      setCards([]);
      setHasMore(false);
      refresh();
      toast({ title: '已全部标为已读' });
    } catch {
      toast({ title: '操作失败', variant: 'destructive' });
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-semibold">消息中心</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {count > 0 ? `${count} 条未读` : '无未读消息'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {count > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAll}
              disabled={markingAll}
              className="gap-1.5"
            >
              <CheckCheck className="h-4 w-4" />
              <span className="hidden sm:inline">全部已读</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="gap-1.5">
            <Link href="/messages/read">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">已读历史</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Card list */}
      {cards.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCheck className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">没有未读消息</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            新采集到的内容会出现在这里
          </p>
          <Button variant="ghost" size="sm" asChild className="mt-4 gap-1.5">
            <Link href="/messages/read">
              <History className="h-4 w-4" />
              查看已读历史
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {cards.map((card) => (
            <MessageCardRow key={card.id} card={card} onClick={() => handleCardClick(card)} />
          ))}

          {loading && (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          <div ref={bottomRef} className="h-1" />
        </div>
      )}
    </div>
  );
}

function MessageCardRow({ card, onClick }: { card: MessageCardItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border bg-card hover:bg-accent/50 transition-colors p-3 md:p-4"
    >
      <div className="flex gap-3 items-start">
        {/* Thumbnail */}
        {card.thumbnailUrl && (
          <img
            src={card.thumbnailUrl}
            alt=""
            className="w-14 h-14 md:w-16 md:h-16 rounded object-cover flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
              {card.subscriptionTopic}
            </Badge>
            <span className="text-[11px] text-muted-foreground truncate">{card.sourceName}</span>
            {card.criteriaResult === 'matched' && (
              <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-sm bg-green-500/15 text-green-600 dark:text-green-400 font-medium flex-shrink-0">
                ✓{card.metricValue ? ` ${card.metricValue}` : ' 满足条件'}
              </span>
            )}
            {card.criteriaResult === 'not_matched' && (
              <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground flex-shrink-0">
                {card.metricValue ? `✗ ${card.metricValue}` : '未满足'}
              </span>
            )}
          </div>

          {/* Title */}
          <p className="text-sm font-semibold leading-snug line-clamp-2">{card.title}</p>

          {/* Summary */}
          {card.summary && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{card.summary}</p>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(card.createdAt)}
            </span>
            <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
          </div>
        </div>
      </div>
    </button>
  );
}
