import { withAuthz } from '@/server/policy';
import { queryAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

/** GET /api/audit (F19): scoped, keyset-paginated audit entries. Read-only. */
export const GET = withAuthz(
  async ({ req, scope }) => {
    const filters = Object.fromEntries(new URL(req.url).searchParams);
    return Response.json(queryAudit(scope, filters));
  },
  { action: 'audit:read' },
);

const methodNotAllowed = () =>
  Response.json(
    { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } },
    { status: 405, headers: { Allow: 'GET' } },
  );

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
