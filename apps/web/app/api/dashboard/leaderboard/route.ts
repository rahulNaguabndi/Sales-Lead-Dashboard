import { dashboardHandler } from '../_lib';
import { getLeaderboard } from '@/server/services/dashboard';

export { dynamic } from '../_lib';

export const GET = dashboardHandler(getLeaderboard);
