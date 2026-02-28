'use client';

import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { Subscription } from '@/types/db';

interface SubscriptionCardProps {
  subscription: Subscription & { latestLog?: string | null };
  onToggle: (id: string, isEnabled: boolean) => void;
  onDelete: (id: string) => void;
  onDiscard?: (id: string) => void;
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
  onDiscard,
}: SubscriptionCardProps) {
  const router = useRouter();
  const { managedStatus, latestLog } = subscription;

  // Cards in creating state have special click behavior
  const handleCardClick = () => {
    if (managedStatus === 'manual_creating' || managedStatus === 'managed_creating') {
      // Both states resume the wizard
      sessionStorage.setItem('wizard-resume-id', subscription.id);
      router.push('/subscriptions/new');
    } else if (managedStatus === 'failed') {
      // Failed — no action, user can only discard via trash button
    } else {
      router.push(`/subscriptions/${subscription.id}`);
    }
  };

  const isCreating = managedStatus === 'manual_creating' || managedStatus === 'managed_creating' || managedStatus === 'failed';

  return (
    <div
      className={`bg-card border border-border rounded-lg p-4 flex flex-col gap-3 transition-shadow touch-manipulation${managedStatus === 'failed' ? ' cursor-default' : ' cursor-pointer hover:shadow-md'}`}
      onClick={handleCardClick}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base truncate">{subscription.topic}</h3>

            {/* Status badges */}
            {managedStatus === 'manual_creating' && (
              <Badge variant="outline" className="text-blue-600 border-blue-400/50 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400 text-xs shrink-0">
                创建中...
              </Badge>
            )}
            {managedStatus === 'managed_creating' && (
              <Badge variant="outline" className="text-amber-600 border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-xs shrink-0 animate-pulse">
                托管创建中
              </Badge>
            )}
            {managedStatus === 'failed' && (
              <Badge variant="outline" className="text-destructive border-destructive/50 bg-destructive/10 text-xs shrink-0">
                创建失败
              </Badge>
            )}

            {/* Normal unread badge */}
            {!isCreating && subscription.unreadCount > 0 && (
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
          {managedStatus === 'manual_creating' && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {latestLog ?? '点击继续创建'}
            </p>
          )}
          {managedStatus === 'managed_creating' && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {latestLog ?? '点击查看进度'}
            </p>
          )}
          {managedStatus === 'failed' && (
            <p className="text-xs text-muted-foreground mt-0.5">点击查看错误详情</p>
          )}
        </div>

        {/* Actions — stop propagation so clicks don't navigate */}
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isCreating ? (
            // Creating state: show only discard button
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => onDiscard?.(subscription.id)}
              aria-label="丢弃"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            // Normal state: show switch + delete
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Stats row — only for normal subscriptions */}
      {!isCreating && (
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
      )}
    </div>
  );
}
