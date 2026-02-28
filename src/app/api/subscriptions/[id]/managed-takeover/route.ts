import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, managedBuildLogs } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import type { FoundSource, GeneratedSource } from '@/types/wizard';

// POST /api/subscriptions/[id]/managed-takeover
// Stops the managed pipeline (by switching status to manual_creating),
// extracts current wizard state from logs, persists it, and returns it
// for the frontend to resume seamlessly in the wizard.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const db = getDb();

    const sub = db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.userId)))
      .get();

    if (!sub) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // If not in managed_creating or failed, return alreadyDone so frontend can handle gracefully
    if (sub.managedStatus !== 'managed_creating' && sub.managedStatus !== 'failed') {
      return Response.json({ alreadyDone: true, managedStatus: sub.managedStatus });
    }

    // Extract wizard state from logs (ordered by time)
    const logs = db
      .select()
      .from(managedBuildLogs)
      .where(eq(managedBuildLogs.subscriptionId, id))
      .orderBy(asc(managedBuildLogs.createdAt))
      .all();

    let foundSources: FoundSource[] = [];
    const generatedSources: GeneratedSource[] = [];
    let findSourcesError: string | null = null;

    // Extract foundSources from logs:
    // 1. Find "已自动选择 X 个数据源" info log (has selected sources, max 5)
    // 2. Fall back to success log with all sources
    for (const log of logs) {
      if (log.step === 'find_sources') {
        if (log.level === 'info' && log.message.includes('已自动选择') && log.payload) {
          // Found the info log with selected sources (max 5)
          try {
            const payload = JSON.parse(log.payload);
            if (Array.isArray(payload)) {
              foundSources = payload as FoundSource[];
              break; // Use this one
            }
          } catch { /* ignore */ }
        } else if (log.level === 'error') {
          findSourcesError = log.message;
        }
      }
    }

    // If no info log with selected sources, fall back to success log
    if (foundSources.length === 0) {
      for (const log of logs) {
        if (log.step === 'find_sources' && log.level === 'success' && log.payload) {
          try {
            const payload = JSON.parse(log.payload);
            if (Array.isArray(payload)) {
              foundSources = payload as FoundSource[];
              break; // Use last success log
            }
          } catch { /* ignore */ }
        }
      }
    }

    // Extract generatedSources from generate_script success logs
    // Each success log has payload: { script, cronExpression }
    // We match the source by title extracted from the log message
    const generatedUrls = new Set<string>();
    for (const log of logs) {
      if (log.step === 'generate_script' && log.level === 'success' && log.payload) {
        try {
          const payload = JSON.parse(log.payload) as { script?: string; cronExpression?: string };
          const titleMatch = log.message.match(/^"(.+)" 脚本生成成功/);
          if (titleMatch && payload.script) {
            const title = titleMatch[1];
            const source = foundSources.find((s) => s.title === title);
            if (source && !generatedUrls.has(source.url)) {
              generatedUrls.add(source.url);
              generatedSources.push({
                title: source.title,
                url: source.url,
                description: source.description,
                script: payload.script,
                cronExpression: payload.cronExpression ?? '0 * * * *',
                initialItems: [],
                isEnabled: true,
              });
            }
          }
        } catch { /* ignore */ }
      }
    }

    // Determine resume step and watch mode:
    // - No sources found yet → watch mode (pipeline still running find_sources)
    // - Sources found, some scripts → Step3
    // - Sources found, no scripts → Step3
    const watchMode = foundSources.length === 0;
    let resumeStep: 2 | 3 = 2;
    if (foundSources.length > 0) resumeStep = 3;

    // Build wizard state to persist
    const wizardState = {
      step: resumeStep,
      topic: sub.topic,
      criteria: sub.criteria ?? '',
      foundSources,
      selectedIndices: foundSources.map((_, i) => i),
      generatedSources,
      subscriptionId: id,
      // In watch mode, Step2 polls this subscription's logs for find_sources output
      watchingManagedId: watchMode ? id : undefined,
      // Error message from managed pipeline (if any)
      managedError: findSourcesError ?? sub.managedError ?? null,
    };

    // Switch status to manual_creating.
    // In watch mode: pipeline is still running find_sources but will stop naturally
    // before generate_scripts (isCancelled check). Sources will be written to logs.
    // In normal mode: pipeline is fully stopped.
    db.update(subscriptions)
      .set({
        managedStatus: 'manual_creating',
        wizardStateJson: JSON.stringify(wizardState),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, id))
      .run();

    return Response.json({
      id,
      topic: sub.topic,
      criteria: sub.criteria ?? '',
      foundSources,
      generatedSources,
      resumeStep,
      watchMode,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[managed-takeover POST]', err);
    return Response.json({ error: 'Failed to takeover managed creation' }, { status: 500 });
  }
}
