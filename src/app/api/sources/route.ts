import { eq, desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sources } from '@/lib/db/schema';

// GET /api/sources?subscriptionId=&page=&limit=
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const subscriptionId = url.searchParams.get('subscriptionId');
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
    const offset = (page - 1) * limit;

    const db = getDb();

    let query = db.select().from(sources).orderBy(desc(sources.createdAt));

    if (subscriptionId) {
      query = query.where(eq(sources.subscriptionId, subscriptionId)) as typeof query;
    }

    const rows = query.limit(limit).offset(offset).all();
    return Response.json({ data: rows, page, limit });
  } catch (err) {
    console.error('[sources GET]', err);
    return Response.json({ error: 'Failed to load sources' }, { status: 500 });
  }
}
