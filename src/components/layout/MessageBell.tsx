'use client';

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { cn } from '@/lib/utils';

interface MessageBellProps {
  className?: string;
  isActive?: boolean;
}

export function MessageBell({ className, isActive }: MessageBellProps) {
  const { count } = useUnreadCount();

  return (
    <Link
      href="/messages"
      className={cn(
        'relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        className
      )}
    >
      <div className="relative">
        <MessageSquare className="h-4 w-4 shrink-0" />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-0.5">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
      消息
    </Link>
  );
}
