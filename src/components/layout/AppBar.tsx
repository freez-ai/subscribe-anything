'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, Github } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from './UserMenu';

const pageTitles: Record<string, string> = {
  '/subscriptions': '我的订阅',
  '/subscriptions/new': '新建订阅',
  '/favorites': '我的收藏',
  '/messages': '消息中心',
  '/messages/read': '已读历史',
  '/settings': '配置',
};

function getTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.match(/^\/subscriptions\/[^/]+\/sources$/)) return '订阅源';
  if (pathname.match(/^\/subscriptions\/[^/]+$/)) return '订阅详情';
  return '订阅万物';
}

function showBack(pathname: string): boolean {
  return pathname !== '/subscriptions' && pathname !== '/favorites' && pathname !== '/messages' && pathname !== '/settings';
}

interface AppBarProps {
  className?: string;
}

export function AppBar({ className }: AppBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const hasBack = showBack(pathname);

  return (
    <header
      className={cn(
        'fixed top-0 inset-x-0 z-40 h-14 items-center border-b bg-background px-4',
        className
      )}
    >
      {hasBack && (
        <button
          onClick={() => router.back()}
          className="mr-2 flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
          aria-label="返回"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <span className="text-base font-semibold">{getTitle(pathname)}</span>
      <div className="ml-auto flex items-center gap-2">
        <UserMenu />
        <a
          href="https://github.com/freez-ai/subscribe-anything"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="GitHub"
        >
          <Github className="h-5 w-5" />
        </a>
      </div>
    </header>
  );
}
