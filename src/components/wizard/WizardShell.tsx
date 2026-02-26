'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WizardState } from '@/types/wizard';
import { useIsMobile } from '@/hooks/useIsMobile';
import Step1Topic from './Step1Topic';
import Step2AgentChat from './Step2AgentChat';
import Step4ScriptGen from './Step4ScriptGen';
import Step5Preview from './Step5Preview';

const STORAGE_KEY = 'wizard-state';

const STEP_LABELS = ['主题', '发现源', '生成脚本', '确认'] as const;

const DEFAULT_STATE: WizardState = {
  step: 1,
  topic: '',
  criteria: '',
  foundSources: [],
  selectedIndices: [],
  generatedSources: [],
};

export default function WizardShell() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [mounted, setMounted] = useState(false);

  // Restore from sessionStorage on mount — but only when resuming (refresh / back-forward).
  // A fresh navigation sets the 'wizard-new' flag before arriving here, so we start clean.
  useEffect(() => {
    const isNew = sessionStorage.getItem('wizard-new') === '1';
    sessionStorage.removeItem('wizard-new');

    if (isNew) {
      // Fresh "New Subscription" click: discard any leftover wizard session
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      // Refresh or back-forward: resume in-progress wizard
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as WizardState;
          setState(parsed);
        }
      } catch {
        // ignore parse errors
      }
    }
    setMounted(true);
  }, []);

  // Persist state on every change
  useEffect(() => {
    if (!mounted) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage errors
    }
  }, [state, mounted]);

  const handleStateChange = (updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    setState((prev) => ({
      ...prev,
      step: Math.min(prev.step + 1, 4) as WizardState['step'],
    }));
  };

  const handleBack = () => {
    setState((prev) => {
      const newStep = Math.max(prev.step - 1, 1) as WizardState['step'];
      // Returning to step 1 means the topic/criteria may change — invalidate source cache
      if (newStep === 1) {
        return { ...prev, step: newStep, foundSources: [], selectedIndices: [] };
      }
      return { ...prev, step: newStep };
    });
  };

  const handleComplete = (subscriptionId: string) => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    router.push(`/subscriptions/${subscriptionId}`);
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const stepProps = {
    state,
    onStateChange: handleStateChange,
    onNext: handleNext,
    onBack: handleBack,
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] max-w-2xl mx-auto">
      {/* Progress Bar */}
      <div className="px-4 pt-4 pb-2 md:px-6 md:pt-6">
        {isMobile ? (
          // Mobile: compact dots
          <div className="flex items-center justify-center gap-2">
            {STEP_LABELS.map((_, idx) => {
              const stepNum = idx + 1;
              const isActive = state.step === stepNum;
              const isCompleted = state.step > stepNum;
              return (
                <div key={stepNum} className="flex items-center">
                  <div
                    className={[
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : isCompleted
                          ? 'bg-primary/30 text-primary'
                          : 'bg-muted text-muted-foreground',
                    ].join(' ')}
                  >
                    {stepNum}
                  </div>
                  {idx < STEP_LABELS.length - 1 && (
                    <div
                      className={[
                        'w-6 h-0.5 mx-0.5 transition-colors',
                        isCompleted ? 'bg-primary/50' : 'bg-muted',
                      ].join(' ')}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          // Desktop: steps with labels
          <div className="flex items-center">
            {STEP_LABELS.map((label, idx) => {
              const stepNum = idx + 1;
              const isActive = state.step === stepNum;
              const isCompleted = state.step > stepNum;
              return (
                <div key={stepNum} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={[
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : isCompleted
                            ? 'bg-primary/30 text-primary'
                            : 'bg-muted text-muted-foreground',
                      ].join(' ')}
                    >
                      {isCompleted ? (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        stepNum
                      )}
                    </div>
                    <span
                      className={[
                        'text-xs font-medium whitespace-nowrap',
                        isActive ? 'text-primary' : 'text-muted-foreground',
                      ].join(' ')}
                    >
                      {label}
                    </span>
                  </div>
                  {idx < STEP_LABELS.length - 1 && (
                    <div
                      className={[
                        'flex-1 h-0.5 mx-2 mb-4 transition-colors',
                        isCompleted ? 'bg-primary/50' : 'bg-muted',
                      ].join(' ')}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Step Content */}
      <div className="flex-1 px-4 md:px-6 pb-24 md:pb-6">
        {state.step === 1 && <Step1Topic {...stepProps} />}
        {state.step === 2 && <Step2AgentChat {...stepProps} />}
        {state.step === 3 && <Step4ScriptGen {...stepProps} />}
        {state.step === 4 && (
          <Step5Preview {...stepProps} onComplete={handleComplete} />
        )}
      </div>
    </div>
  );
}
