'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  meetsCriteriaFlag: boolean;
  criteriaResult?: 'matched' | 'not_matched' | 'invalid';
  metricValue?: string | null;
  readAt: string;
  createdAt: string;
}

interface Subscription {
  id: string;
  topic: string;
}

const PAGE_SIZE = 50;

export default function ReadHistoryPage() {
  const [cards, setCards] = useState<MessageCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [filterSubId, setFilterSubId] = useState('all');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load subscriptions for filter dropdown
  useEffect(() => {
    fetch('/api/subscriptions')
      .then((r) => r.json())
      .then((data) => setSubscriptions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const loadMore = useCallback(async (currentOffset: number, subId: string, replace = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'read', limit: String(PAGE_SIZE), offset: String(currentOffset) });
      if (subId !== 'all') params.set('subscriptionId', subId);
      const res = await fetch(`/api/message-cards?${params}`);
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
    setOffset(0);
    setHasMore(true);
    loadMore(0, filterSubId, true);
  }, [filterSubId, loadMore]);

  useEffect(() => {
    if (!bottomRef.current || !hasMore || loading) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore(offset, filterSubId);
    }, { threshold: 0.1 });
    obs.observe(bottomRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, offset, filterSubId, loadMore]);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" asChild className="-ml-2">
          <Link href="/messages">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">已读历史</h1>
        </div>
        {subscriptions.length > 1 && (
          <Select value={filterSubId} onValueChange={setFilterSubId}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="全部订阅" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">全部订阅</SelectItem>
              {subscriptions.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">{s.topic}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* List */}
      {cards.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground">暂无已读记录</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {cards.map((card) => (
            <a
              key={card.id}
              href={card.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border bg-card/60 hover:bg-accent/40 transition-colors p-3 md:p-4 opacity-80 hover:opacity-100"
            >
              <div className="flex gap-3 items-start">
                {card.thumbnailUrl && (
                  <img
                    src={card.thumbnailUrl}
                    alt=""
                    className="w-12 h-12 rounded object-cover flex-shrink-0 grayscale-[30%]"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
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
                  <p className="text-sm font-medium leading-snug line-clamp-2">{card.title}</p>
                  {card.summary && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{card.summary}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[11px] text-muted-foreground">
                      已读于 {formatDistanceToNow(card.readAt)}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
                  </div>
                </div>
              </div>
            </a>
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
