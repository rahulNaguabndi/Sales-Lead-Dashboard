import type { NextRequest } from 'next/server';
import { claim } from '@/server/services/assignment';
import { handleAssignment } from '@/server/services/assignment.http';

export const dynamic = 'force-dynamic';

export const POST = (req: NextRequest, ctx: { params: { id: string } }) =>
  handleAssignment(req, async (user) => ({ lead: (await claim(user, ctx.params.id)).lead }));
