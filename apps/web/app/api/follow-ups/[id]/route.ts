import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { PatchFollowUpSchema } from '@leaddesk/shared';
import { patch } from '@/server/services/followup';
import { fail, parseBody, requireUser } from '../_lib';

/** PATCH /api/follow-ups/:id (F08): complete | snooze | cancel. */
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const user = await requireUser(req, true);
    const input = await parseBody(req, PatchFollowUpSchema);
    const followUp = await patch(user, ctx.params.id, input);
    return NextResponse.json({ followUp });
  } catch (err) {
    return fail(err);
  }
}
