import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { subscriptions, analysisReports } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// GET /api/subscriptions/[id]/reports/[reportId]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id, reportId } = await params;
    const db = getDb();

    const report = db.select()
      .from(analysisReports)
      .where(and(
        eq(analysisReports.id, reportId),
        eq(analysisReports.subscriptionId, id),
        eq(analysisReports.userId, session.userId)
      ))
      .get();

    if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

    return Response.json(report);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[report GET]', err);
    return Response.json({ error: 'Failed to fetch report' }, { status: 500 });
  }
}

// PATCH /api/subscriptions/[id]/reports/[reportId]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id, reportId } = await params;
    const db = getDb();

    const body = await req.json() as { isStarred?: boolean };

    const report = db.select({ id: analysisReports.id })
      .from(analysisReports)
      .where(and(
        eq(analysisReports.id, reportId),
        eq(analysisReports.subscriptionId, id),
        eq(analysisReports.userId, session.userId)
      ))
      .get();
    if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

    if (typeof body.isStarred === 'boolean') {
      db.update(analysisReports)
        .set({ isStarred: body.isStarred })
        .where(eq(analysisReports.id, reportId))
        .run();
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[report PATCH]', err);
    return Response.json({ error: 'Failed to update report' }, { status: 500 });
  }
}

// DELETE /api/subscriptions/[id]/reports/[reportId]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id, reportId } = await params;
    const db = getDb();

    const report = db.select({ id: analysisReports.id })
      .from(analysisReports)
      .where(and(
        eq(analysisReports.id, reportId),
        eq(analysisReports.subscriptionId, id),
        eq(analysisReports.userId, session.userId)
      ))
      .get();
    if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

    db.delete(analysisReports)
      .where(eq(analysisReports.id, reportId))
      .run();

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[report DELETE]', err);
    return Response.json({ error: 'Failed to delete report' }, { status: 500 });
  }
}
