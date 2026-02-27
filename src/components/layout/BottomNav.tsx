'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Heart, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  className?: string;
}

export function BottomNav({ className }: BottomNavProps) {
  const pathname = usePathname();

  const navItems = [
    { href: '/subscriptions', label: '订阅', icon: BookOpen },
    { href: '/favorites', label: '收藏', icon: Heart },
    { href: '/settings', label: '配置', icon: Settings },
  ];

  return (
    <nav
      className={cn(
        'fixed bottom-0 inset-x-0 z-40 items-center justify-around border-t bg-background',
        'pb-[env(safe-area-inset-bottom)]',
        className
      )}
      style={{ touchAction: 'manipulation' }}
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-1 px-4 py-2 min-w-[44px] min-h-[44px] justify-center',
              active ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
