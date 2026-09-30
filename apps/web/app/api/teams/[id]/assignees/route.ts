import type { NextRequest } from 'next/server';
import { listAssignees } from '@/server/services/assignment';
import { handleAssignment } from '@/server/services/assignment.http';

export const dynamic = 'force-dynamic';

export const GET = (req: NextRequest, ctx: { params: { id: string } }) =>
  handleAssignment(req, (user) =>
    listAssignees(user, ctx.params.id, req.nextUrl.searchParams.get('leadId') ?? undefined),
  );
