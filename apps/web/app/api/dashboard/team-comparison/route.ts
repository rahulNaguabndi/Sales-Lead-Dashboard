import { dashboardHandler } from '../_lib';
import { getTeamComparison } from '@/server/services/dashboard';

export { dynamic } from '../_lib';

export const GET = dashboardHandler(getTeamComparison);
