import type { NextRequest } from 'next/server';
import { getTeamSettings } from '@/server/services/assignment';
import { handleAssignment } from '@/server/services/assignment.http';

export const dynamic = 'force-dynamic';

export const GET = (req: NextRequest) => handleAssignment(req, (user) => getTeamSettings(user));
