import type { NextRequest } from 'next/server';
import { assignBodySchema } from '@leaddesk/shared';
import { assign } from '@/server/services/assignment';
import { handleAssignment, readJson } from '@/server/services/assignment.http';

export const dynamic = 'force-dynamic';

export const POST = (req: NextRequest, ctx: { params: { id: string } }) =>
  handleAssignment(req, async (user) => {
    const body = assignBodySchema.parse(await readJson(req));
    return { lead: (await assign(user, ctx.params.id, body)).lead };
  });
