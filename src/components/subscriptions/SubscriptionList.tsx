'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import SubscriptionCard from './SubscriptionCard';
import ManagedProgressDrawer from './ManagedProgressDrawer';
import type { Subscription } from '@/types/db';

export default function SubscriptionList() {
  const { toast } = useToast();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progressTarget, setProgressTarget] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setSubscriptions(data);
    } catch {
      setError('加载订阅列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  // Poll for updates when there are subscriptions in creating state
  useEffect(() => {
    const hasCreating = subscriptions.some(
      (s) => s.managedStatus === 'managed_creating' || s.managedStatus === 'manual_creating'
    );
    if (!hasCreating) return;

    const timer = setInterval(fetchSubscriptions, 5000);
    return () => clearInterval(timer);
  }, [subscriptions, fetchSubscriptions]);

  const handleToggle = useCallback(async (id: string, isEnabled: boolean) => {
    // Optimistic update
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isEnabled } : s))
    );

    try {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      // Rollback
      setSubscriptions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isEnabled: !isEnabled } : s))
      );
      toast({ title: isEnabled ? '启用失败' : '禁用失败', variant: 'destructive' });
    }
  }, [toast]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('确认删除这个订阅？相关数据将一并删除。')) return;

    const snapshot = subscriptions.find((s) => s.id === id);
    // Optimistic remove
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));

    try {
      const res = await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast({ title: '订阅已删除' });
    } catch {
      // Rollback
      if (snapshot) {
        setSubscriptions((prev) => [snapshot, ...prev]);
      }
      toast({ title: '删除失败', variant: 'destructive' });
    }
  }, [subscriptions, toast]);

  // Discard: delete without confirm dialog (for creating state cards)
  const handleDiscard = useCallback(async (id: string) => {
    if (!confirm('确认丢弃此创建中的订阅？')) return;

    const snapshot = subscriptions.find((s) => s.id === id);
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));

    try {
      const res = await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast({ title: '已丢弃' });
    } catch {
      if (snapshot) {
        setSubscriptions((prev) => [snapshot, ...prev]);
      }
      toast({ title: '操作失败', variant: 'destructive' });
    }
  }, [subscriptions, toast]);

  const handleTakeover = useCallback(() => {
    // After takeover, the subscription was deleted — refresh list
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        <p>{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchSubscriptions}>
          重试
        </Button>
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-medium mb-2">暂无订阅</p>
        <p className="text-sm mb-6">创建你的第一个智能订阅，让 AI 帮你追踪任何主题</p>
        <Link href="/subscriptions/new" onClick={() => sessionStorage.setItem('wizard-new', '1')}>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            新建订阅
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {subscriptions.map((sub) => (
          <SubscriptionCard
            key={sub.id}
            subscription={sub}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onOpenProgress={(id) => setProgressTarget(id)}
            onDiscard={handleDiscard}
          />
        ))}
      </div>

      <ManagedProgressDrawer
        subscriptionId={progressTarget}
        isOpen={progressTarget !== null}
        onClose={() => setProgressTarget(null)}
        onTakeover={handleTakeover}
        onDiscard={handleDiscard}
      />
    </>
  );
}
