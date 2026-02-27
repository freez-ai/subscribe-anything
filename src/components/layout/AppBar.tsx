'use client';

import Image from 'next/image';
import { Github } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from './UserMenu';

interface AppBarProps {
  className?: string;
}

export function AppBar({ className }: AppBarProps) {
  return (
    <header
      className={cn(
        'fixed top-0 inset-x-0 z-40 h-14 items-center border-b bg-background px-4',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Image src="/android-chrome-192x192.png" alt="logo" width={28} height={28} className="rounded-md" />
        <span className="text-base font-semibold">订阅万物</span>
      </div>
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
