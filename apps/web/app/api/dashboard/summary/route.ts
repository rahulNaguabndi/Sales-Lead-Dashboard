import { dashboardHandler } from '../_lib';
import { getSummary } from '@/server/services/dashboard';

export { dynamic } from '../_lib';

export const GET = dashboardHandler(getSummary);
