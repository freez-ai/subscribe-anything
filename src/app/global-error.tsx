'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-semibold mb-2">出错了</h1>
            <p className="text-muted-foreground mb-6 text-sm">
              应用遇到了意外错误。
            </p>
            <Button onClick={reset}>重试</Button>
          </div>
        </div>
      </body>
    </html>
  );
}
