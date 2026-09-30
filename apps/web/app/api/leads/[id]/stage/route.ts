import { NextResponse, type NextRequest } from 'next/server';
import { StageChangeSchema } from '@leaddesk/shared';
import { requireUser } from '@/server/auth/session';
import { toErrorResponse } from '@/server/http/errors';
import {
  StageValidationError,
  VersionConflictError,
  transition,
} from '@/server/services/stage';
import { toLeadDTO } from '@/server/services/stage-dto';

export const dynamic = 'force-dynamic';

function originOk(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

/** PATCH /api/leads/:id/stage (F07): Zod -> authorize -> stageService.transition. */
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    if (!originOk(req)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Cross-origin request rejected' } },
        { status: 403 },
      );
    }
    const user = await requireUser(req);
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new StageValidationError('Request body must be valid JSON');
    }
    const parsed = StageChangeSchema.safeParse(json);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const i of parsed.error.issues) fields[i.path.join('.') || '_'] ??= i.message;
      throw new StageValidationError('Request is invalid', { fields });
    }
    const out = await transition({ user, ip: req.headers.get('x-forwarded-for') }, ctx.params.id, parsed.data);
    return NextResponse.json({
      lead: toLeadDTO(out.lead),
      activities: out.activities.map((a) => ({
        id: a.id,
        type: a.type,
        note: a.note,
        metadata: a.metadata,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    if (err instanceof VersionConflictError) {
      Object.assign(body.error, { current: toLeadDTO(err.current), updatedBy: err.updatedBy });
    }
    return NextResponse.json(body, { status });
  }
}
