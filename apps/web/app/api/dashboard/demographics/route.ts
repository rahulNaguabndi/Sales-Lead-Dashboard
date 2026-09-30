import { NextResponse, type NextRequest } from 'next/server';
import { DemographicsQuerySchema } from '@leaddesk/shared';
import { requireUser } from '@/server/auth/session';
import { authorize } from '@/server/policy';
import { toErrorResponse } from '@/server/http/errors';
import { getDemographics } from '@/server/services/demographics';

export const dynamic = 'force-dynamic';

/** GET /api/dashboard/demographics: aggregate-only, scope-enforced, suppression applied server-side (F17). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    await authorize(user, 'demographics:read');
    const query = DemographicsQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    return NextResponse.json(await getDemographics(user, query));
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
