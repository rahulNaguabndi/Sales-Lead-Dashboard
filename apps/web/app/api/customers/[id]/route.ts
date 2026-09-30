import { NextResponse, type NextRequest } from 'next/server';
import { CustomerQuerySchema, PatchPreferencesSchema } from '@leaddesk/shared';
import { UnauthenticatedError } from '@/server/auth/errors';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { getProfile, updatePreferences } from '@/server/channels';
import { ValidationError, toErrorResponse } from '@/server/http/errors';

type Ctx = { params: { id: string } };

function fieldErrors(error: { issues: { path: (string | number)[]; message: string }[] }) {
  return Object.fromEntries(error.issues.map((i) => [i.path.join('.') || 'body', i.message]));
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new UnauthenticatedError();
    const q = CustomerQuerySchema.safeParse({ leadId: req.nextUrl.searchParams.get('leadId') });
    if (!q.success) throw new ValidationError('Invalid query', { fields: fieldErrors(q.error) });
    return NextResponse.json(await getProfile(user, params.id, q.data.leadId));
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new UnauthenticatedError();
    const json = await req.json().catch(() => null);
    const parsed = PatchPreferencesSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError('Invalid preferences', { fields: fieldErrors(parsed.error) });
    }
    return NextResponse.json({ customer: await updatePreferences(user, params.id, parsed.data) });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
