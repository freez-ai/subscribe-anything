'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutGrid, AlignJustify, ExternalLink, Loader2, Heart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from '@/lib/utils/time';

/* ── Types ── */
interface FavoriteItem {
  id: string;
  originalCardId: string | null;
  title: string;
  summary: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string;
  publishedAt: string | null;
  meetsCriteriaFlag: boolean;
  criteriaResult?: 'matched' | 'not_matched' | 'invalid';
  metricValue?: string | null;
  subscriptionTopic: string | null;
  sourceTitle: string | null;
  favoriteAt: string;
  isFavorite?: boolean; // local state for toggle feedback
}

const PAGE_SIZE = 50;

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [layout, setLayout] = useState<'masonry' | 'timeline'>('masonry');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);

  /* ── Fetch favorites ── */
  const loadMore = useCallback(async (currentOffset: number, replace = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
      });
      const res = await fetch(`/api/favorites?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const items: FavoriteItem[] = data.data;
      setFavorites((prev) => (replace ? items : [...prev, ...items]));
      setTotal(data.total);
      setHasMore(items.length === PAGE_SIZE);
      setOffset(currentOffset + items.length);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMore(0, true);
  }, [loadMore]);

  /* ── Infinite scroll ── */
  useEffect(() => {
    if (!bottomRef.current || !hasMore || loading) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) loadMore(offset);
      },
      { threshold: 0.1 }
    );
    obs.observe(bottomRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, offset, loadMore]);

  /* ── Actions ── */
  const handleCardClick = (item: FavoriteItem) => {
    window.open(item.sourceUrl, '_blank', 'noopener,noreferrer');
  };

  const handleToggleFavorite = useCallback(async (itemId: string) => {
    try {
      // Use the favorites-specific toggle endpoint with the favorite's own ID
      const res = await fetch(`/api/favorites/${itemId}/toggle`, {
        method: 'POST',
      });
      if (!res.ok) return;
      const { isFavorite } = await res.json();

      // Update local state for immediate feedback, but don't remove from list
      // This gives user a chance to undo by clicking again
      setFavorites((prev) =>
        prev.map((f) => (f.id === itemId ? { ...f, isFavorite } : f))
      );
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">我的收藏</h1>
          <p className="text-xs text-muted-foreground mt-0.5">共 {total} 条收藏</p>
        </div>
        {/* Layout toggle: desktop only */}
        <div className="hidden md:flex items-center gap-1">
          <Button
            variant={layout === 'masonry' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setLayout('masonry')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={layout === 'timeline' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7"
            onClick={() => setLayout('timeline')}
          >
            <AlignJustify className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{favorites.length} 条已加载</span>
      </div>

      {/* Cards */}
      {favorites.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Heart className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">暂无收藏</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            在订阅详情页点击卡片上的红心即可收藏
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: always timeline */}
          <div className="flex flex-col gap-2 md:hidden">
            {favorites.map((item) => (
              <TimelineCard
                key={item.id}
                item={item}
                onClick={() => handleCardClick(item)}
                onToggleFavorite={() => handleToggleFavorite(item.id)}
              />
            ))}
          </div>
          {/* Desktop: respect layout state */}
          {layout === 'masonry' ? (
            <div className="hidden md:flex gap-3">
              {[0, 1, 2].map((colIdx) => (
                <div key={colIdx} className="flex-1 flex flex-col gap-3">
                  {favorites
                    .filter((_, i) => i % 3 === colIdx)
                    .map((item) => (
                      <MasonryCard
                        key={item.id}
                        item={item}
                        onClick={() => handleCardClick(item)}
                        onToggleFavorite={() => handleToggleFavorite(item.id)}
                      />
                    ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="hidden md:flex flex-col gap-2">
              {favorites.map((item) => (
                <TimelineCard
                  key={item.id}
                  item={item}
                  onClick={() => handleCardClick(item)}
                  onToggleFavorite={() => handleToggleFavorite(item.id)}
                />
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
function MasonryCard({
  item,
  onClick,
  onToggleFavorite,
}: {
  item: FavoriteItem;
  onClick: () => void;
  onToggleFavorite: () => void;
}) {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite();
  };

  const isFavorited = item.isFavorite !== false; // default to true

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border transition-colors overflow-hidden flex flex-col bg-card hover:bg-accent/60 relative"
    >
      {/* Favorite button */}
      <button
        onClick={handleFavoriteClick}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-background/80 hover:bg-background transition-colors"
      >
        <Heart
          className={[
            'h-4 w-4 transition-colors',
            isFavorited ? 'text-red-500 fill-red-500' : 'text-muted-foreground hover:text-red-500',
          ].join(' ')}
        />
      </button>
      {item.thumbnailUrl && (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="w-full object-cover max-h-72"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div className="p-3 flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground truncate">
            {item.sourceTitle || '未知来源'}
          </span>
        </div>
        <p className="text-sm leading-snug line-clamp-3">{item.title}</p>
        {item.summary && (
          <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed">
            {item.summary}
          </p>
        )}
        <div className="flex items-center mt-1">
          <span className="text-[11px] text-muted-foreground">
            收藏于 {formatDistanceToNow(item.favoriteAt)}
          </span>
          {item.criteriaResult && (
            <span className="ml-2">
              <CriteriaResultBadge result={item.criteriaResult} metricValue={item.metricValue} />
            </span>
          )}
          <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
        </div>
      </div>
    </button>
  );
}

/* ── Timeline Card ── */
function TimelineCard({
  item,
  onClick,
  onToggleFavorite,
}: {
  item: FavoriteItem;
  onClick: () => void;
  onToggleFavorite: () => void;
}) {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite();
  };

  const isFavorited = item.isFavorite !== false; // default to true

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border p-3 transition-colors flex gap-3 items-start bg-card hover:bg-accent/60 relative"
    >
      {/* Favorite button */}
      <button
        onClick={handleFavoriteClick}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-background/80 hover:bg-background transition-colors"
      >
        <Heart
          className={[
            'h-4 w-4 transition-colors',
            isFavorited ? 'text-red-500 fill-red-500' : 'text-muted-foreground hover:text-red-500',
          ].join(' ')}
        />
      </button>
      {item.thumbnailUrl && (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="w-12 h-12 rounded object-cover flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div className="flex-1 min-w-0 pr-8">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] text-muted-foreground truncate">
            {item.sourceTitle || '未知来源'}
          </span>
        </div>
        <p className="text-sm leading-snug line-clamp-2">{item.title}</p>
        {item.summary && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.summary}</p>
        )}
        <div className="flex items-center mt-1 gap-2">
          <span className="text-[11px] text-muted-foreground">
            收藏于 {formatDistanceToNow(item.favoriteAt)}
          </span>
          {item.criteriaResult && (
            <CriteriaResultBadge result={item.criteriaResult} metricValue={item.metricValue} />
          )}
          <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
        </div>
      </div>
    </button>
  );
}
