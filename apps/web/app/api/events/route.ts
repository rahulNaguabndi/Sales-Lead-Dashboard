import { getCurrentUser } from '@/server/auth/session';
import { handleEvents } from '@/lib/sse/handler';
import { getHub, loadScope } from '@/lib/sse/singleton';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return handleEvents(req, { getUser: getCurrentUser, getHub, loadScope });
}
