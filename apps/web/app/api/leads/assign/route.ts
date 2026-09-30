import type { NextRequest } from 'next/server';
import { bulkAssignBodySchema } from '@leaddesk/shared';
import { bulkAssign } from '@/server/services/assignment';
import { handleAssignment, readJson } from '@/server/services/assignment.http';

export const dynamic = 'force-dynamic';

export const POST = (req: NextRequest) =>
  handleAssignment(req, async (user) =>
    bulkAssign(user, bulkAssignBodySchema.parse(await readJson(req))),
  );
