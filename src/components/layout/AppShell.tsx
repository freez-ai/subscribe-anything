'use client';

import { NavSidebar } from './NavSidebar';
import { BottomNav } from './BottomNav';
import { AppBar } from './AppBar';

export function AppShell({ children }: { children: React.ReactNode }) {
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
