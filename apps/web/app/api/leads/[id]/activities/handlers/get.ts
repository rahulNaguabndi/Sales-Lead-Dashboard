import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { toErrorResponse } from '@/server/http/errors';
import { UnauthenticatedError } from '@/server/auth/errors';
import { listActivities } from '@/server/services/lead-detail';

const Query = z.object({
  order: z.enum(['asc', 'desc']).default('desc'),
  kind: z.enum(['ALL', 'USER', 'SYSTEM']).default('ALL'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(200).optional(),
});

export async function handleGet(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new UnauthenticatedError();
    const query = Query.parse(Object.fromEntries(req.nextUrl.searchParams));
    return NextResponse.json(await listActivities(user, ctx.params.id, query));
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
