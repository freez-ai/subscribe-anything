import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sources } from '@/lib/db/schema';
import { collect } from '@/lib/scheduler/collector';

// POST /api/sources/[id]/trigger
// Manually trigger a collection run for a source.
// Bypasses the p-limit queue — runs immediately and returns the result.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const source = db.select().from(sources).where(eq(sources.id, id)).get();
    if (!source) {
      return Response.json({ error: 'Source not found' }, { status: 404 });
    }

    // Run directly — does NOT go through p-limit
    const result = await collect(id);

    return Response.json(result);
  } catch (err) {
    console.error('[sources/[id]/trigger POST]', err);
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
