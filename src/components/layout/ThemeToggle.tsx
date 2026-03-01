'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  variant?: 'icon' | 'sidebar';
}

export function ThemeToggle({ variant = 'icon' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  // 侧边栏模式 - 显示为菜单项样式
  if (variant === 'sidebar') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-left">
            <Sun className="h-4 w-4 shrink-0 dark:hidden" />
            <Moon className="h-4 w-4 shrink-0 hidden dark:block" />
            <span>主题</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4}>
          <DropdownMenuItem
            onClick={() => setTheme('light')}
            className={cn(theme === 'light' && 'bg-accent')}
          >
            <Sun className="mr-2 h-4 w-4" />
            <span>亮色</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setTheme('dark')}
            className={cn(theme === 'dark' && 'bg-accent')}
          >
            <Moon className="mr-2 h-4 w-4" />
            <span>暗色</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setTheme('system')}
            className={cn(theme === 'system' && 'bg-accent')}
          >
            <Monitor className="mr-2 h-4 w-4" />
            <span>跟随系统</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // 图标模式 - 顶部 AppBar 使用
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="切换主题"
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">切换主题</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className={cn(theme === 'light' && 'bg-accent')}
        >
          <Sun className="mr-2 h-4 w-4" />
          <span>亮色</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className={cn(theme === 'dark' && 'bg-accent')}
        >
          <Moon className="mr-2 h-4 w-4" />
          <span>暗色</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className={cn(theme === 'system' && 'bg-accent')}
        >
          <Monitor className="mr-2 h-4 w-4" />
          <span>跟随系统</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
