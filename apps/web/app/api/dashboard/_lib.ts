import { NextResponse, type NextRequest } from 'next/server';
import { DashboardFilterSchema } from '@leaddesk/shared';
import { requireUser } from '@/server/auth/session';
import { toErrorResponse } from '@/server/http/errors';
import { getScope } from '@/server/policy';
import type { DashboardCtx } from '@/server/services/dashboard';

export const dynamic = 'force-dynamic';

/** authenticate → Zod filters → scope → service → JSON (errors use the shared error shape). */
export function dashboardHandler<T>(
  run: (ctx: DashboardCtx, filters: ReturnType<typeof DashboardFilterSchema.parse>) => Promise<T>,
) {
  return async (req: NextRequest) => {
    try {
      const user = await requireUser(req);
      const filters = DashboardFilterSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
      const scope = await getScope(user.id);
      return NextResponse.json(await run({ user, scope }, filters));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      return NextResponse.json(body, { status });
    }
  };
}
