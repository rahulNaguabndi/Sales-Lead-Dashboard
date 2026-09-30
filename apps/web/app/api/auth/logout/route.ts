import { NextResponse, type NextRequest } from 'next/server';
import { withTx } from '@/server/db/client';
import { writeAudit } from '@/server/db/audit';
import { SESSION_COOKIE } from '@/server/auth/constants';
import { verifySession } from '@/server/auth/jwt';
import { revokeJti, sessionClearCookie } from '@/server/auth/session';

export async function POST(req: NextRequest) {
  const claims = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (claims) {
    await revokeJti(claims.jti, claims.exp);
    try {
      withTx((tx) =>
        writeAudit(tx, {
          actorId: claims.sub,
          action: 'auth.logout',
          entity: 'user',
          entityId: claims.sub,
        }),
      );
    } catch (err) {
      console.warn('[auth] could not write logout audit row', (err as Error).message);
    }
  }
  const res = new NextResponse(null, { status: 204 });
  res.headers.append('Set-Cookie', sessionClearCookie());
  return res;
}
