'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { Subscription } from '@/types/db';

interface SubscriptionCardProps {
  subscription: Subscription;
  onToggle: (id: string, isEnabled: boolean) => void;
  onDelete: (id: string) => void;
}

function formatRelativeTime(date: Date | null | undefined): string {
  if (!date) return '从未更新';
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export default function SubscriptionCard({
  subscription,
  onToggle,
  onDelete,
}: SubscriptionCardProps) {
  const router = useRouter();

  return (
    <div
      className={[
        'border rounded-lg p-4 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow touch-manipulation',
        subscription.unreadCount > 0
          ? 'bg-card border-l-[3px] border-l-primary'
          : 'bg-card',
      ].join(' ')}
      onClick={() => router.push(`/subscriptions/${subscription.id}`)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base truncate">{subscription.topic}</h3>
            {subscription.unreadCount > 0 && (
              <Badge variant="default" className="bg-blue-500 hover:bg-blue-500 text-white shrink-0">
                {subscription.unreadCount} 未读
              </Badge>
            )}
          </div>
          {subscription.criteria && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
              监控：{subscription.criteria}
            </p>
          )}
        </div>

        {/* Actions — stop propagation so clicks don't navigate */}
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={subscription.isEnabled}
            onCheckedChange={(checked) => onToggle(subscription.id, checked)}
            aria-label={subscription.isEnabled ? '禁用订阅' : '启用订阅'}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(subscription.id)}
            aria-label="删除订阅"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>共 {subscription.totalCount} 条</span>
        <span>·</span>
        <span>更新于 {formatRelativeTime(subscription.lastUpdatedAt)}</span>
        {!subscription.isEnabled && (
          <>
            <span>·</span>
            <span className="text-amber-500">已暂停</span>
          </>
        )}
      </div>
    </div>
  );
}
