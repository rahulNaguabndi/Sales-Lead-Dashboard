import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { toErrorResponse } from '@/server/http/errors';
import { UnauthenticatedError } from '@/server/auth/errors';
import { getLeadDetail } from '@/server/services/lead-detail';

const Params = z.object({ id: z.string().min(1).max(64) });

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new UnauthenticatedError();
    const { id } = Params.parse(ctx.params);
    return NextResponse.json(await getLeadDetail(user, id));
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
