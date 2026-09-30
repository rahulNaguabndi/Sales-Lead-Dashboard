import type { NextRequest } from 'next/server';
import { teamSettingsPatchSchema } from '@leaddesk/shared';
import { updateTeamSettings } from '@/server/services/assignment';
import { handleAssignment, readJson } from '@/server/services/assignment.http';

export const dynamic = 'force-dynamic';

export const PATCH = (req: NextRequest, ctx: { params: { id: string } }) =>
  handleAssignment(req, async (user) =>
    updateTeamSettings(user, ctx.params.id, teamSettingsPatchSchema.parse(await readJson(req))),
  );
