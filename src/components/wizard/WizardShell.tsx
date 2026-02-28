'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WizardState } from '@/types/wizard';
import type { FoundSource, GeneratedSource } from '@/types/wizard';
import { useIsMobile } from '@/hooks/useIsMobile';
import Step1Topic from './Step1Topic';
import Step2FindSources from './Step2FindSources';
import Step3ScriptGen from './Step3ScriptGen';
import Step4Confirm from './Step4Confirm';

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
  const [discarding, setDiscarding] = useState(false);
  // Only auto-start Step2 streaming when coming fresh from Step1 (not on restore/resume)
  const [step2AutoStart, setStep2AutoStart] = useState(false);

  // Mount: handle new / resume-by-id / session-restore
  useEffect(() => {
    const isNew = sessionStorage.getItem('wizard-new') === '1';
    sessionStorage.removeItem('wizard-new');

    const resumeId = sessionStorage.getItem('wizard-resume-id');
    sessionStorage.removeItem('wizard-resume-id');

    if (isNew) {
      // Fresh "New Subscription" click: discard any leftover wizard session
      sessionStorage.removeItem(STORAGE_KEY);
      setMounted(true);
      return;
    }

    if (resumeId) {
      // Resume from DB via subscription id
      fetch(`/api/subscriptions/${resumeId}`)
        .then((r) => r.json())
        .then((sub) => {
          if (sub.wizardStateJson) {
            try {
              const parsed = JSON.parse(sub.wizardStateJson) as WizardState;
              setState(parsed);
            } catch { /* ignore */ }
          }
        })
        .catch(() => { /* ignore */ })
        .finally(() => setMounted(true));
      return;
    }

    // Refresh or back-forward: resume in-progress wizard from sessionStorage
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as WizardState;
        setState(parsed);
      }
    } catch {
      // ignore parse errors
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

  // Persist wizard state to DB when subscriptionId is set
  const persistToDb = (updatedState: WizardState) => {
    if (!updatedState.subscriptionId) return;
    fetch(`/api/subscriptions/${updatedState.subscriptionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wizardStateJson: JSON.stringify(updatedState) }),
    }).catch(() => { /* ignore, best-effort */ });
  };

  const handleStateChange = (updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  // Step1 next: create bare subscription first
  const handleStep1Next = async (topic: string, criteria: string) => {
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, criteria, bare: true }),
      });
      const data = await res.json();
      const newState: WizardState = {
        ...state,
        step: 2,
        topic,
        criteria,
        subscriptionId: data.id,
      };
      setState(newState);
      setStep2AutoStart(true);
      persistToDb(newState);
    } catch {
      // Fallback: advance without DB persistence
      setState((prev) => ({ ...prev, step: 2, topic, criteria }));
      setStep2AutoStart(true);
    }
  };

  const handleNext = () => {
    setState((prev) => {
      const newState = {
        ...prev,
        step: Math.min(prev.step + 1, 4) as WizardState['step'],
      };
      persistToDb(newState);
      return newState;
    });
  };

  const handleBack = () => {
    setState((prev) => {
      const newStep = Math.max(prev.step - 1, 1) as WizardState['step'];
      // Returning to step 1 means the topic/criteria may change — invalidate source cache
      const newState = newStep === 1
        ? { ...prev, step: newStep, foundSources: [], selectedIndices: [] }
        : { ...prev, step: newStep };
      persistToDb(newState);
      return newState;
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

  // Discard: delete subscription if exists, clear session, go to list
  const handleDiscard = async () => {
    if (discarding) return;
    if (!confirm('确认丢弃此次订阅创建？已填写的内容将丢失。')) return;

    setDiscarding(true);
    try {
      if (state.subscriptionId) {
        await fetch(`/api/subscriptions/${state.subscriptionId}`, { method: 'DELETE' });
      }
    } catch { /* ignore */ }

    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }

    router.push('/subscriptions');
  };

  // Managed create: start background pipeline and go to list
  const handleManagedCreate = async (data: {
    foundSources?: FoundSource[];
    generatedSources?: GeneratedSource[];
    startStep: 'find_sources' | 'generate_scripts' | 'complete';
  }) => {
    try {
      await fetch('/api/subscriptions/managed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: state.topic,
          criteria: state.criteria,
          startStep: data.startStep,
          foundSources: data.foundSources,
          generatedSources: data.generatedSources,
          // Reuse existing subscription (switches manual_creating → managed_creating)
          existingSubscriptionId: state.subscriptionId,
        }),
      });
    } catch { /* ignore */ }

    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }

    router.push('/subscriptions');
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
          // Mobile: compact dots with Discard button
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
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
            {state.step > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                onClick={handleDiscard}
                disabled={discarding}
                aria-label="丢弃并返回"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          // Desktop: steps with labels + Discard button
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center flex-1">
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
            {state.step > 1 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive flex-shrink-0 mb-4"
                onClick={handleDiscard}
                disabled={discarding}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                丢弃
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Step Content */}
      <div className="flex-1 px-4 md:px-6 pb-24 md:pb-6">
        {state.step === 1 && (
          <Step1Topic
            {...stepProps}
            onStep1Next={handleStep1Next}
            onManagedCreate={async (topic, criteria) => {
              // Step1 managed create: update local state then fire pipeline
              setState((prev) => ({ ...prev, topic, criteria }));
              try {
                await fetch('/api/subscriptions/managed', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ topic, criteria, startStep: 'find_sources' }),
                });
              } catch { /* ignore */ }
              try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
              router.push('/subscriptions');
            }}
          />
        )}
        {state.step === 2 && (
          <Step2FindSources
            {...stepProps}
            autoStart={step2AutoStart}
            onManagedCreate={(foundSources) =>
              handleManagedCreate({
                startStep: foundSources.length > 0 ? 'generate_scripts' : 'find_sources',
                foundSources: foundSources.length > 0 ? foundSources : undefined,
              })
            }
          />
        )}
        {state.step === 3 && (
          <Step3ScriptGen
            {...stepProps}
            onManagedCreate={(generatedSources) =>
              handleManagedCreate({ startStep: 'complete', generatedSources })
            }
          />
        )}
        {state.step === 4 && (
          <Step4Confirm {...stepProps} onComplete={handleComplete} />
        )}
      </div>
    </div>
  );
}
