'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[MessagesError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="text-center max-w-md">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
        <h2 className="text-xl font-semibold mb-2">加载失败</h2>
        <p className="text-muted-foreground mb-6 text-sm">
          消息中心无法加载，请检查网络后重试。
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset}>重试</Button>
          <Button variant="outline" asChild>
            <Link href="/subscriptions">返回订阅列表</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
