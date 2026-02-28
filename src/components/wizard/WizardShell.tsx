'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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

  // Mount: handle new / resume-by-id / session-restore
  useEffect(() => {
    const isNew = sessionStorage.getItem('wizard-new') === '1';
    sessionStorage.removeItem('wizard-new');

    const resumeId = sessionStorage.getItem('wizard-resume-id');
    sessionStorage.removeItem('wizard-resume-id');

    if (isNew) {
      sessionStorage.removeItem(STORAGE_KEY);
      setMounted(true);
      return;
    }

    if (resumeId) {
      // Resume from DB via subscription id
      fetch(`/api/subscriptions/${resumeId}`)
        .then((r) => r.json())
        .then(async (sub) => {
          if (sub.managedStatus === 'managed_creating' || sub.managedStatus === 'failed') {
            // Take over from managed_creating/failed: switch to manual_creating and restart current step
            await handleManagedTakeover(resumeId);
          } else if (sub.wizardStateJson) {
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

    // Refresh or back-forward: resume from sessionStorage
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Take over a managed_creating subscription and restart its current step
  const handleManagedTakeover = async (subscriptionId: string) => {
    try {
      const takeoverRes = await fetch(`/api/subscriptions/${subscriptionId}/managed-takeover`, {
        method: 'POST',
      });
      const takeover = await takeoverRes.json();

      if (takeover.alreadyDone) {
        // Pipeline already completed/failed — just go to list
        return;
      }

      const foundSources: FoundSource[] = takeover.foundSources ?? [];
      const selectedIndices: number[] = takeover.selectedIndices ?? foundSources.map((_: FoundSource, i: number) => i);
      const resumeStep: 2 | 3 = takeover.resumeStep ?? 2;

      // Only restart generate_scripts for selected sources
      const selectedSources = selectedIndices.map((i: number) => foundSources[i]).filter(Boolean);

      const newState: WizardState = {
        step: resumeStep,
        topic: takeover.topic ?? '',
        criteria: takeover.criteria ?? '',
        foundSources,
        selectedIndices,
        generatedSources: takeover.generatedSources ?? [],
        subscriptionId,
      };
      setState(newState);

      if (resumeStep === 3) {
        // Restart generate_scripts for selected sources that haven't been processed yet
        await fetch(`/api/subscriptions/${subscriptionId}/run-step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: 'generate_scripts', sources: selectedSources }),
        });
      }
      // resumeStep === 2: find_sources still running or not started yet.
      // Step2 will connect to SSE and pick up results when ready.

      persistToDb({ ...newState });
    } catch { /* ignore */ }
  };

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

  // Step1 next: create bare subscription and start find_sources in background
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
        managedError: null, // Clear any previous managed error
      };
      setState(newState);
      persistToDb(newState);

      // Start find_sources in background
      await fetch(`/api/subscriptions/${data.id}/run-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'find_sources' }),
      });
    } catch {
      // Fallback: advance without DB persistence
      setState((prev) => ({ ...prev, step: 2, topic, criteria }));
    }
  };

  // Step2 next: start generate_scripts in background and advance to step 3
  const handleStep2Next = async (selectedSources: FoundSource[]) => {
    const selectedIndices = state.foundSources
      .map((s, i) => (selectedSources.some((sel) => sel.url === s.url) ? i : -1))
      .filter((i) => i >= 0);

    const newState: WizardState = {
      ...state,
      step: 3,
      selectedIndices,
      managedError: null, // Clear managed error when proceeding manually
    };
    setState(newState);
    persistToDb(newState);

    // Start generate_scripts in background if subscriptionId exists
    if (state.subscriptionId) {
      await fetch(`/api/subscriptions/${state.subscriptionId}/run-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'generate_scripts', sources: selectedSources }),
      }).catch(() => {});
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

  // "返回" button: save progress and go to subscription list.
  // Does NOT delete the subscription — background steps keep running.
  // User can resume later by clicking the card in the list.
  const handleBack = () => {
    // Persist current state (incl. foundSources + step2LlmCalls) before leaving
    persistToDb(state);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    router.push('/subscriptions');
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

  // Managed create: start full background pipeline and go to list
  const handleManagedCreate = async (data: {
    foundSources?: FoundSource[];
    allFoundSources?: FoundSource[];
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
          allFoundSources: data.allFoundSources,
          generatedSources: data.generatedSources,
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
          // Mobile: compact dots
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
        {state.step === 1 && (
          <Step1Topic
            {...stepProps}
            onStep1Next={handleStep1Next}
            onManagedCreate={async (topic, criteria) => {
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
            onStep2Next={handleStep2Next}
            onManagedCreate={(selectedSources) =>
              handleManagedCreate({
                startStep: selectedSources.length > 0 ? 'generate_scripts' : 'find_sources',
                foundSources: selectedSources.length > 0 ? selectedSources : undefined,
                allFoundSources: state.foundSources.length > 0 ? state.foundSources : undefined,
              })
            }
            onDiscard={handleDiscard}
          />
        )}
        {state.step === 3 && (
          <Step3ScriptGen
            {...stepProps}
            onManagedCreate={(generatedSources) => {
              const selectedSources = state.foundSources.filter((_, i) =>
                state.selectedIndices.includes(i)
              );
              // If all selected sources are done, complete directly.
              // Otherwise hand off with generate_scripts so the managed pipeline
              // finishes the remaining sources (skipping already-completed ones).
              if (
                generatedSources.length > 0 &&
                generatedSources.length >= selectedSources.length
              ) {
                handleManagedCreate({ startStep: 'complete', generatedSources });
              } else {
                handleManagedCreate({
                  startStep: 'generate_scripts',
                  foundSources: selectedSources,
                  allFoundSources: state.foundSources,
                  generatedSources: generatedSources.length > 0 ? generatedSources : undefined,
                });
              }
            }}
            onDiscard={handleDiscard}
          />
        )}
        {state.step === 4 && (
          <Step4Confirm {...stepProps} onComplete={handleComplete} onDiscard={handleDiscard} />
        )}
      </div>
    </div>
  );
}
