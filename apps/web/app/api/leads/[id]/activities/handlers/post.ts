import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { CreateActivitySchema } from '@leaddesk/shared';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { ForbiddenError, ValidationError, toErrorResponse } from '@/server/http/errors';
import { StaleLeadError, logActivity } from '@/server/services/activity';

const MAX_BODY_BYTES = 16 * 1024;

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
  if (err instanceof StaleLeadError) {
    Object.assign(body.error, { currentVersion: err.currentVersion, updatedBy: err.updatedBy });
  }
  return NextResponse.json(body, { status });
}

/** POST /api/leads/:id/activities (F06): validate, authorize, log atomically. */
export async function handlePost(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    if (!originOk(req)) throw new ForbiddenError('Cross-origin request rejected');

    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    const raw = await req.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      throw new ValidationError('Request body is too large', {
        fields: { _: 'Body exceeds 16 KB' },
      });
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new ValidationError('Request body must be valid JSON', {
        fields: { _: 'Invalid JSON' },
      });
    }

    const parsed = CreateActivitySchema.safeParse(json);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join('.') || '_'] ??= issue.message;
      }
      throw new ValidationError('Request is invalid', { fields });
    }

    const result = await logActivity(user, ctx.params.id, parsed.data, {
      ip: req.headers.get('x-forwarded-for'),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
