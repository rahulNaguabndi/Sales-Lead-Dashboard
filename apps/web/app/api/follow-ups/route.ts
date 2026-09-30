import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ListFollowUpsQuerySchema } from '@leaddesk/shared';
import { ValidationError } from '@/server/http/errors';
import { listForUser } from '@/server/services/followup';
import { fail, requireUser, zodFields } from './_lib';

/** GET /api/follow-ups?view=today|overdue|upcoming[&owner=<id>] (F08). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req, false);
    const q = Object.fromEntries(new URL(req.url).searchParams);
    const parsed = ListFollowUpsQuerySchema.safeParse(q);
    if (!parsed.success) {
      throw new ValidationError('Invalid query', { fields: zodFields(parsed.error) });
    }
    return NextResponse.json(await listForUser(user, parsed.data));
  } catch (err) {
    return fail(err);
  }
}
