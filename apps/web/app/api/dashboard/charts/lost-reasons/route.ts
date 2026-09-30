import { dashboardHandler } from '../../_lib';
import { getLostReasons } from '@/server/services/dashboard';

export { dynamic } from '../../_lib';

export const GET = dashboardHandler(getLostReasons);
