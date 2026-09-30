import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { LEAD_SOURCES, PRIORITIES } from '@leaddesk/shared';
import { requireUser } from '@/server/auth/session';
import { toErrorResponse } from '@/server/http/errors';
import { listPipeline } from '@/server/services/stage';

export const dynamic = 'force-dynamic';

const csv = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
    z.array(item),
  );

const Query = z.object({
  owner: csv(z.string().max(64)).optional(),
  source: csv(z.enum(LEAD_SOURCES)).optional(),
  priority: csv(z.enum(PRIORITIES)).optional(),
});

/** GET /api/pipeline: scope-enforced Kanban columns (F07). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const q = Query.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    return NextResponse.json(await listPipeline(user, q));
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
