import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { analysisReports } from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth';

// GET /api/reports/[reportId]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const session = await requireAuth();
    const { reportId } = await params;
    const db = getDb();

    const report = db.select()
      .from(analysisReports)
      .where(eq(analysisReports.userId, session.userId))
      .all()
      .find(r => r.id === reportId);

    if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

    // Only allow viewing completed reports
    if (report.status !== 'completed') {
      if (report.status === 'generating') {
        return Response.json({ error: 'Report is still generating' }, { status: 400 });
      }
      if (report.status === 'failed') {
        return Response.json({ error: report.error || 'Report generation failed' }, { status: 400 });
      }
    }

    return Response.json(report);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[report GET]', err);
    return Response.json({ error: 'Failed to fetch report' }, { status: 500 });
  }
}
