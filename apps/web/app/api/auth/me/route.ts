import { NextResponse, type NextRequest } from 'next/server';
import { toErrorResponse } from '@/server/http/errors';
import { requireUser } from '@/server/auth/session';

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ user: await requireUser(req) });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
