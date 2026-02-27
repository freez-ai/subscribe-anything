'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SubscriptionList from '@/components/subscriptions/SubscriptionList';

function markNewWizard() {
  sessionStorage.setItem('wizard-new', '1');
}

export default function SubscriptionsPage() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Page header — desktop */}
      <div className="hidden md:flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">我的订阅</h1>
      </div>

      {/* Mobile page title */}
      <h1 className="text-2xl font-semibold mb-4 md:hidden">我的订阅</h1>

      <SubscriptionList />

      {/* Mobile FAB — fixed above bottom nav */}
      <Link href="/subscriptions/new" className="md:hidden" onClick={markNewWizard}>
        <button
          aria-label="新建订阅"
          className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center touch-manipulation active:scale-95 transition-transform"
        >
          <Plus className="h-6 w-6" />
        </button>
      </Link>
    </div>
  );
}

