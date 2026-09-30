import { dashboardHandler } from '../../_lib';
import { getSources } from '@/server/services/dashboard';

export { dynamic } from '../../_lib';

export const GET = dashboardHandler(getSources);
