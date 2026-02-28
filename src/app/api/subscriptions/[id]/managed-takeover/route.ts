import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, managedBuildLogs } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import type { FoundSource, GeneratedSource } from '@/types/wizard';

// POST /api/subscriptions/[id]/managed-takeover
// Extracts wizard state from managed build logs, deletes the subscription,
// and returns the state for the frontend to resume in the wizard.
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

    // If already done (not in managed_creating), return alreadyDone flag
    if (sub.managedStatus !== 'managed_creating') {
      return Response.json({ alreadyDone: true, managedStatus: sub.managedStatus });
    }

    // Extract wizard state from logs
    const logs = db
      .select()
      .from(managedBuildLogs)
      .where(eq(managedBuildLogs.subscriptionId, id))
      .all();

    let foundSources: FoundSource[] = [];
    let generatedSources: GeneratedSource[] = [];

    // Extract foundSources from find_sources step
    for (const log of logs) {
      if (log.step === 'find_sources' && log.level === 'success' && log.payload) {
        try {
          const payload = JSON.parse(log.payload);
          if (Array.isArray(payload)) {
            foundSources = payload as FoundSource[];
          }
        } catch { /* ignore */ }
      }
    }

    // Extract generatedSources from generate_script success logs
    for (const log of logs) {
      if (log.step === 'generate_script' && log.level === 'success' && log.payload) {
        try {
          const payload = JSON.parse(log.payload) as { script?: string; cronExpression?: string };
          // Find the corresponding source from foundSources by log message
          const titleMatch = log.message.match(/^"(.+)" 脚本生成成功/);
          if (titleMatch && payload.script) {
            const title = titleMatch[1];
            const source = foundSources.find((s) => s.title === title);
            if (source) {
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

    // Delete the subscription (cascade deletes logs)
    // First unschedule any sources (shouldn't have any since it's still creating)
    db.delete(subscriptions).where(eq(subscriptions.id, id)).run();

    // Determine resume step
    let resumeStep: 2 | 3 | 4 = 2;
    if (generatedSources.length > 0) {
      resumeStep = 4;
    } else if (foundSources.length > 0) {
      resumeStep = 3;
    }

    return Response.json({
      topic: sub.topic,
      criteria: sub.criteria ?? '',
      foundSources,
      generatedSources,
      resumeStep,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[managed-takeover POST]', err);
    return Response.json({ error: 'Failed to takeover managed creation' }, { status: 500 });
  }
}
