import { dashboardHandler } from '../../_lib';
import { getLeadsOverTime } from '@/server/services/dashboard';

export { dynamic } from '../../_lib';

export const GET = dashboardHandler(getLeadsOverTime);
