'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import WizardShell from '@/components/wizard/WizardShell';

export default function NewSubscriptionPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasActiveProvider, setHasActiveProvider] = useState(false);

  useEffect(() => {
    async function checkLLM() {
      try {
        const res = await fetch('/api/settings/llm-providers/active');
        if (!res.ok) throw new Error('Failed');
        const { hasActive } = await res.json();
        setHasActiveProvider(hasActive);
      } catch {
        setHasActiveProvider(false);
      } finally {
        setChecking(false);
      }
    }
    checkLLM();
  }, []);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasActiveProvider) {
    return (
      <div className="p-4 md:p-6 max-w-lg mx-auto pt-16">
        <div className="flex flex-col items-center text-center gap-4">
          <AlertCircle className="h-12 w-12 text-amber-500" />
          <h2 className="text-xl font-semibold">需要先配置 AI 供应商</h2>
          <p className="text-muted-foreground">
            新建订阅向导需要 AI 能力来自动发现数据源和生成采集脚本。
            请先在配置页添加并激活一个 LLM 供应商。
          </p>
          <div className="flex gap-3 mt-2">
            <Button variant="outline" onClick={() => router.back()}>
              返回
            </Button>
            <Link href="/settings">
              <Button>前往配置</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Wizard
  return <WizardShell />;
}
