import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { UnauthenticatedError } from '@/server/auth/errors';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { ForbiddenError, ValidationError, toErrorResponse } from '@/server/http/errors';
import type { CurrentUser } from '@/server/policy/types';

const MAX_BODY_BYTES = 4 * 1024;

function originOk(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

export function fail(err: unknown): NextResponse {
  const { status, body } = toErrorResponse(err);
  return NextResponse.json(body, { status });
}

export async function requireUser(req: NextRequest, mutating: boolean): Promise<CurrentUser> {
  if (mutating && !originOk(req)) throw new ForbiddenError('Cross-origin request rejected');
  const user = await getCurrentUser(req);
  if (!user) {
    throw new UnauthenticatedError();
  }
  return user;
}

export function zodFields(error: { issues: { path: (string | number)[]; message: string }[] }) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
  return fields;
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    throw new ValidationError('Request body is too large', { fields: { _: 'Body exceeds 4 KB' } });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ValidationError('Request body must be valid JSON', { fields: { _: 'Invalid JSON' } });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ValidationError(Object.values(zodFields(parsed.error))[0] ?? 'Request is invalid', {
      fields: zodFields(parsed.error),
    });
  }
  return parsed.data;
}
