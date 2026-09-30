import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { CHANNELS } from '@leaddesk/shared';
import { TEMPLATE_KEYS, TEMPLATE_LANGS } from '@leaddesk/shared';
import { UnauthenticatedError } from '@/server/auth/errors';
import { getCurrentUser } from '@/server/auth/get-current-user';
import { getContactLink } from '@/server/channels';
import { ValidationError, toErrorResponse } from '@/server/http/errors';

const Query = z.object({
  channel: z.enum(CHANNELS),
  template: z.enum(TEMPLATE_KEYS).optional(),
  lang: z.enum(TEMPLATE_LANGS).optional(),
  offer: z.string().max(200).optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new UnauthenticatedError();
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const q = Query.safeParse(raw);
    if (!q.success) {
      throw new ValidationError('Invalid query', {
        fields: Object.fromEntries(q.error.issues.map((i) => [i.path.join('.'), i.message])),
      });
    }
    return NextResponse.json(await getContactLink(user, params.id, q.data));
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
