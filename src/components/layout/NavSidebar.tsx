'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Github, Heart, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from './UserMenu';

interface NavSidebarProps {
  className?: string;
}

export function NavSidebar({ className }: NavSidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { href: '/subscriptions', label: '订阅', icon: BookOpen },
    { href: '/favorites', label: '收藏', icon: Heart },
    { href: '/settings', label: '配置', icon: Settings },
  ];

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 w-64 flex-col border-r bg-background',
        className
      )}
    >
      <div className="flex h-16 items-center border-b px-6">
        <span className="text-lg font-semibold">订阅万物</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {navItems.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  pathname.startsWith(href)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t p-3 space-y-1">
        <UserMenu />
        <a
          href="https://github.com/freez-ai/subscribe-anything"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <Github className="h-4 w-4 shrink-0" />
          GitHub
        </a>
      </div>
    </aside>
  );
}
