import type { NextRequest } from 'next/server';
import { rebalancePool } from '@/server/services/assignment';
import { handleAssignment } from '@/server/services/assignment.http';

export const dynamic = 'force-dynamic';

export const POST = (req: NextRequest, ctx: { params: { id: string } }) =>
  handleAssignment(req, (user) => rebalancePool(user, ctx.params.id));
