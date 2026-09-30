import { dashboardHandler } from '../../_lib';
import { getStageAging } from '@/server/services/dashboard';

export { dynamic } from '../../_lib';

export const GET = dashboardHandler(getStageAging);
