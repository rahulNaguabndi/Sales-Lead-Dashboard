import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// STUB owned by F01; F06 replaces the body of this function (signature stays).
export async function handlePost(_req: NextRequest, _ctx: { params: { id: string } }) {
  return NextResponse.json(
    { error: { code: 'NOT_IMPLEMENTED', message: 'POST /activities not yet implemented' } },
    { status: 501 },
  );
}
