import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '../auth/get-current-user';
import { ForbiddenError, ValidationError, toErrorResponse } from '../http/errors';
import type { CurrentUser } from '../policy';
import { AlreadyAssignedError, BulkForbiddenError } from './assignment';

function originOk(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser clients send no Origin
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

function errorResponse(err: unknown): NextResponse {
  const { status, body } = toErrorResponse(err);
  if (err instanceof AlreadyAssignedError) Object.assign(body.error, { ownerName: err.ownerName });
  if (err instanceof BulkForbiddenError) Object.assign(body.error, { leadIds: err.leadIds });
  return NextResponse.json(body, { status });
}

export async function readJson(req: NextRequest): Promise<unknown> {
  const raw = await req.text();
  if (raw.length > 64 * 1024) throw new ValidationError('Request body is too large');
  if (raw.trim() === '') return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError('Body must be valid JSON');
  }
}

/** Shared wrapper for the F11 endpoints: origin check, session, error mapping. */
export async function handleAssignment(
  req: NextRequest,
  fn: (user: CurrentUser) => Promise<unknown>,
): Promise<NextResponse> {
  try {
    if (req.method !== 'GET' && !originOk(req))
      throw new ForbiddenError('Cross-origin request rejected');
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
        { status: 401 },
      );
    }
    return NextResponse.json(await fn(user));
  } catch (err) {
    return errorResponse(err);
  }
}
