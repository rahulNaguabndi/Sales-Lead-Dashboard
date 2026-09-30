import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { CreateFollowUpSchema } from '@leaddesk/shared';
import { fail, parseBody, requireUser } from '@/app/api/follow-ups/_lib';
import { create, listForLead } from '@/server/services/followup';

/** POST /api/leads/:id/follow-ups (F08): schedule a follow-up without logging an activity. */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const user = await requireUser(req, true);
    const input = await parseBody(req, CreateFollowUpSchema);
    const followUp = await create(user, ctx.params.id, input);
    return NextResponse.json({ followUp }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

/** GET /api/leads/:id/follow-ups (F08): pending follow-ups, cadence guidance and at-risk flag. */
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const user = await requireUser(req, false);
    return NextResponse.json(await listForLead(user, ctx.params.id));
  } catch (err) {
    return fail(err);
  }
}
