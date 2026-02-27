'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Shield } from 'lucide-react';

export function UserMenu() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <Button variant="ghost" size="sm" disabled>
        加载中...
      </Button>
    );
  }

  if (!user) {
    return null;
  }

  const displayName = user.isGuest ? '游客' : (user.name || user.email || '用户');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={displayName}
              className="w-6 h-6 rounded-full"
            />
          ) : (
            <User className="w-4 h-4" />
          )}
          <span className="hidden sm:inline max-w-32 truncate">{displayName}</span>
          {user.isAdmin && <Shield className="w-3 h-3 text-yellow-500" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span>{displayName}</span>
            {user.email && (
              <span className="text-xs text-muted-foreground font-normal">
                {user.email}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.isAdmin && (
          <DropdownMenuItem className="text-xs text-muted-foreground">
            <Shield className="w-3 h-3 mr-2" />
            管理员
          </DropdownMenuItem>
        )}
        {user.isGuest && (
          <DropdownMenuItem className="text-xs text-muted-foreground">
            游客模式 - 数据将保留
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-red-600 dark:text-red-400">
          <LogOut className="w-4 h-4 mr-2" />
          登出
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
