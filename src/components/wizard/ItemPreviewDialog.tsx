'use client';

import { ExternalLink, X } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/utils/time';
import type { CollectedItem } from '@/lib/sandbox/contract';

interface ItemPreviewDialogProps {
  title: string;
  items: CollectedItem[];
  onClose: () => void;
}

export function ItemPreviewDialog({ title, items, onClose }: ItemPreviewDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50">
      <div className="bg-background w-full md:max-w-2xl md:rounded-xl shadow-xl flex flex-col max-h-[90vh] rounded-t-xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b flex-shrink-0">
          <div className="min-w-0 pr-4">
            <h2 className="font-semibold text-base truncate">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {items.length} 条已采集内容预览
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground mt-0.5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Timeline list */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {items.map((item, i) => (
            <PreviewTimelineCard key={i} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CriteriaResultBadge({
  result,
  metricValue,
}: {
  result?: 'matched' | 'not_matched' | 'invalid';
  metricValue?: string;
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

function PreviewTimelineCard({ item }: { item: CollectedItem }) {
  return (
    <button
      onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
      className="w-full text-left rounded-lg border p-3 transition-colors flex gap-3 items-start bg-card hover:bg-accent/60"
    >
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
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug line-clamp-2">{item.title}</p>
        {item.summary && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.summary}</p>
        )}
        <div className="flex items-center mt-1 gap-2">
          {item.publishedAt && (
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(item.publishedAt)}
            </span>
          )}
          {item.criteriaResult && (
            <CriteriaResultBadge result={item.criteriaResult} metricValue={item.metricValue} />
          )}
          <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
        </div>
      </div>
    </button>
  );
}
