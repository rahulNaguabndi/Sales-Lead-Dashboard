import { dashboardHandler } from '../../_lib';
import { getFunnel } from '@/server/services/dashboard';

export { dynamic } from '../../_lib';

export const GET = dashboardHandler(getFunnel);
