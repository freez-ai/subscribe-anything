import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, managedBuildLogs } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';
import { runFindSourcesStep, runGenerateScriptsStep } from '@/lib/managed/pipeline';
import type { FoundSource } from '@/types/wizard';

// In-memory set to prevent duplicate concurrent runs per subscription+step.
// Works because everything runs in a single Node.js process.
const runningSteps = new Set<string>();

// POST /api/subscriptions/[id]/run-step
// Body: { step: 'find_sources' | 'generate_scripts', sources?: FoundSource[] }
// Starts the background step fire-and-forget.
// Returns: { started: true } | { running: true }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const { step, sources } = body as { step?: string; sources?: FoundSource[] };

    if (step !== 'find_sources' && step !== 'generate_scripts') {
      return Response.json({ error: 'Invalid step. Must be find_sources or generate_scripts' }, { status: 400 });
    }

    const db = getDb();
    const sub = db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, session.userId)))
      .get();

    if (!sub) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const key = `${id}:${step}`;
    if (runningSteps.has(key)) {
      return Response.json({ running: true });
    }

    if (step === 'find_sources') {
      // Clear old find_sources logs to start fresh
      db.delete(managedBuildLogs)
        .where(
          and(
            eq(managedBuildLogs.subscriptionId, id),
            eq(managedBuildLogs.step, 'find_sources')
          )
        )
        .run();

      runningSteps.add(key);
      runFindSourcesStep(id, sub.topic, sub.criteria ?? undefined, session.userId)
        .finally(() => runningSteps.delete(key))
        .catch(() => {});
    } else {
      // generate_scripts: do NOT clear existing logs — runGenerateScriptsStep skips already-completed sources
      const srcList = (sources ?? []) as FoundSource[];

      runningSteps.add(key);
      runGenerateScriptsStep(id, srcList, sub.criteria ?? undefined, session.userId)
        .finally(() => runningSteps.delete(key))
        .catch(() => {});
    }

    return Response.json({ started: true }, { status: 202 });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[run-step POST]', err);
    return Response.json({ error: 'Failed to start step' }, { status: 500 });
  }
}
