'use client';

import { usePathname } from 'next/navigation';
import { NavSidebar } from './NavSidebar';
import { BottomNav } from './BottomNav';
import { AppBar } from './AppBar';
import { useAuth } from '@/contexts/AuthContext';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const pathname = usePathname();

  // Don't show app shell on login page, reset-password page, or while loading auth
  const isLoginPage = pathname === '/login';
  const isResetPasswordPage = pathname === '/reset-password';

  if (isLoginPage || isResetPasswordPage) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <NavSidebar className="hidden md:flex" />

      {/* Mobile top app bar */}
      <AppBar className="flex md:hidden" />

      {/* Main content: mobile has top padding for AppBar + bottom padding for BottomNav */}
      <main className="md:ml-64 pt-14 md:pt-0 pb-16 md:pb-0 min-h-screen">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <BottomNav className="flex md:hidden" />
    </div>
  );
}
