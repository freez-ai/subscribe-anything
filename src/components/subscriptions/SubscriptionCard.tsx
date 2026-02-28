'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ArrowRight, Trash2 } from 'lucide-react';
import type { Subscription } from '@/types/db';

interface SubscriptionCardProps {
  subscription: Subscription & {
    latestLog?: string | null;
    latestLogStep?: string | null;
    wizardStep?: number | null;
  };
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

const SWIPE_THRESHOLD = 100;
const SWIPE_MAX = 120;

export default function SubscriptionCard({
  subscription,
  onToggle,
  onDelete,
  onDiscard,
}: SubscriptionCardProps) {
  const router = useRouter();
  const { managedStatus, latestLog, latestLogStep, wizardStep } = subscription;

  // Swipe state
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  // Map wizard step number to build-log step name
  const wizardStepToLogStep: Record<number, string> = {
    2: 'find_sources',
    3: 'generate_script',
    4: 'complete',
  };

  // Step label mapping
  const stepLabels: Record<number, string> = {
    1: '填写主题中',
    2: '发现源中',
    3: '生成脚本中',
    4: '确认中',
  };

  // Step badge color classes (subtle, not prominent)
  const stepBadgeColors: Record<number, { bg: string; text: string }> = {
    1: { bg: 'bg-slate-100 dark:bg-slate-800/40', text: 'text-slate-600 dark:text-slate-400' },
    2: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400' },
    3: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-600 dark:text-teal-400' },
    4: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400' },
  };

  // Only show latestLog if log step matches current wizard step
  const currentStep = wizardStep ?? null;
  const expectedLogStep = currentStep ? wizardStepToLogStep[currentStep] : null;
  const shouldShowLog = latestLog && latestLogStep && expectedLogStep && latestLogStep === expectedLogStep;
  const stepLabel = currentStep ? stepLabels[currentStep] : null;

  // Cards in creating state have special click behavior
  const handleCardClick = () => {
    if (swipeX < -SWIPE_THRESHOLD / 2) return; // Don't click if swiped

    if (managedStatus === 'manual_creating' || managedStatus === 'managed_creating' || managedStatus === 'failed') {
      // All creating/failed states resume wizard
      sessionStorage.setItem('wizard-resume-id', subscription.id);
      router.push('/subscriptions/new');
    } else {
      router.push(`/subscriptions/${subscription.id}`);
    }
  };

  // Managed creating state: card not directly clickable, show takeover button
  // Failed state: card clickable (to show details)
  const isManagedCreating = managedStatus === 'managed_creating';
  const isFailed = managedStatus === 'failed';
  const isManualCreating = managedStatus === 'manual_creating';

  // Touch handlers for swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsSwiping(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    // Only allow left swipe (negative deltaX) and limit vertical movement
    if (deltaX < 0 && Math.abs(deltaY) < 50) {
      setIsSwiping(true);
      // Clamp between 0 and -SWIPE_MAX
      const clampedDeltaX = Math.max(-SWIPE_MAX, Math.min(0, deltaX));
      setSwipeX(clampedDeltaX);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isSwiping) return;

    // If swiped past threshold, snap to open, else close
    if (swipeX < -SWIPE_THRESHOLD) {
      setSwipeX(-SWIPE_MAX);
    } else {
      setSwipeX(0);
    }
    setIsSwiping(false);
  }, [isSwiping, swipeX]);

  const handleDelete = useCallback(() => {
    setSwipeX(0);
    onDelete(subscription.id);
  }, [onDelete, subscription.id]);

  // Reset swipe when clicking outside
  const handleClickOutside = useCallback(() => {
    setSwipeX(0);
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-lg"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClickOutside}
    >
      {/* Delete action button (revealed on swipe) */}
      <div
        className="absolute inset-y-0 right-0 bg-destructive flex items-center justify-end px-4 transition-transform"
        style={{
          transform: `translateX(${swipeX + SWIPE_MAX}px)`,
          width: `${SWIPE_MAX}px`,
        }}
        onClick={(e) => {
          e.stopPropagation();
          handleDelete();
        }}
      >
        <div className="flex flex-col items-center gap-1 text-white">
          <Trash2 className="h-5 w-5" />
          <span className="text-xs">删除</span>
        </div>
      </div>

      {/* Main card */}
      <div
        ref={cardRef}
        className={`bg-card border border-border rounded-lg p-4 flex flex-col gap-3 transition-transform touch-manipulation ${!isManagedCreating ? 'cursor-pointer hover:shadow-md' : ''}`}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.3s ease-out',
        }}
        onClick={!isManagedCreating && swipeX > -SWIPE_THRESHOLD ? handleCardClick : undefined}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base truncate">{subscription.topic}</h3>

              {/* Status badges */}
              {isManagedCreating && (
                <Badge variant="outline" className="text-amber-600 border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-xs shrink-0 animate-pulse">
                  托管创建中
                </Badge>
              )}
              {isFailed && (
                <Badge variant="outline" className="text-destructive border-destructive/50 bg-destructive/10 text-xs shrink-0">
                  创建失败
                </Badge>
              )}

              {/* Normal unread badge */}
              {!isManagedCreating && !isManualCreating && subscription.unreadCount > 0 && (
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
            {isManualCreating && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1.5">
                {stepLabel && currentStep && (
                  <span className={`inline-flex items-center rounded ${stepBadgeColors[currentStep].bg} ${stepBadgeColors[currentStep].text} px-1.5 py-0.5 text-[10px] font-medium shrink-0`}>
                    {stepLabel}
                  </span>
                )}
                <span className="truncate">{shouldShowLog ? latestLog : '点击继续创建'}</span>
              </p>
            )}
            {isManagedCreating && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1.5">
                {stepLabel && currentStep && (
                  <span className={`inline-flex items-center rounded ${stepBadgeColors[currentStep].bg} ${stepBadgeColors[currentStep].text} px-1.5 py-0.5 text-[10px] font-medium shrink-0`}>
                    {stepLabel}
                  </span>
                )}
                <span className="truncate">{shouldShowLog ? latestLog : '托管创建中，等待接管'}</span>
              </p>
            )}
            {isFailed && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 flex items-start gap-1.5">
                {stepLabel && currentStep && (
                  <span className={`inline-flex items-center rounded ${stepBadgeColors[currentStep].bg} ${stepBadgeColors[currentStep].text} px-1.5 py-0.5 text-[10px] font-medium shrink-0 mt-px`}>
                    {stepLabel}
                  </span>
                )}
                <span>{subscription.managedError ?? '创建失败，点击查看详情或使用删除按钮丢弃'}</span>
              </p>
            )}
          </div>

          {/* Actions — stop propagation so clicks don't navigate */}
          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            {isManagedCreating ? (
              // Managed creating state: show takeover + discard buttons
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs text-blue-600 border-blue-400/50 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                  onClick={handleCardClick}
                >
                  接管
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => onDiscard?.(subscription.id)}
                  aria-label="丢弃"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              // Normal state / manual creating / failed: show switch + delete (desktop only, hide on mobile)
              <>
                <Switch
                  checked={subscription.isEnabled}
                  onCheckedChange={(checked) => onToggle(subscription.id, checked)}
                  aria-label={subscription.isEnabled ? '禁用订阅' : '启用订阅'}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden h-8 w-8 md:flex text-muted-foreground hover:text-destructive"
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
        {!isManagedCreating && !isManualCreating && (
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
    </div>
  );
}
