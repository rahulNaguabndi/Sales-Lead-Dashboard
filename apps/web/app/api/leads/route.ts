import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { LeadListQuerySchema } from '@leaddesk/shared';
import { requireUser } from '@/server/auth/session';
import { toErrorResponse } from '@/server/http/errors';
import { logRequest } from '@/server/http/logger';
import { listLeads } from '@/server/services/lead-query';

export const dynamic = 'force-dynamic';

/** GET /api/leads: session, Zod-validated params, scope-enforced ranked list (F04). */
export async function GET(req: NextRequest) {
  const started = Date.now();
  const requestId = randomUUID();
  let userId: string | null = null;
  let res: NextResponse;
  try {
    const user = await requireUser(req);
    userId = user.id;
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = LeadListQuerySchema.parse(params);
    res = NextResponse.json(await listLeads(user, query));
  } catch (err) {
    const { status, body } = toErrorResponse(err, requestId);
    res = NextResponse.json(body, { status });
  }
  logRequest({
    route: 'GET /api/leads',
    userId,
    status: res.status,
    ms: Date.now() - started,
    requestId,
  });
  return res;
}
