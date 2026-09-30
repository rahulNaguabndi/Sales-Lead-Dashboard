import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { db, withTx } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { writeAudit } from '@/server/db/audit';
import { toErrorResponse, ValidationError } from '@/server/http/errors';
import { signSession } from '@/server/auth/jwt';
import { DUMMY_HASH, verifyPassword } from '@/server/auth/password';
import {
  checkLoginLimiter,
  emailHash,
  hitLoginLimiter,
  loginKey,
  resetLoginLimiter,
} from '@/server/auth/rate-limit';
import { roleHome } from '@/server/auth/next-path';
import { sessionSetCookie } from '@/server/auth/session';

const LoginSchema = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(200),
});

const invalid = () =>
  NextResponse.json(
    { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
    { status: 401 },
  );

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

export async function POST(req: NextRequest) {
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new ValidationError('Request body must be JSON');
    }
    const { email: rawEmail, password } = LoginSchema.parse(raw);
    const email = rawEmail.trim().toLowerCase();
    const ip = clientIp(req);
    const key = loginKey(ip, email);

    const limit = await checkLoginLimiter(key);
    if (limit.blocked) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const user = db.select().from(users).where(eq(users.email, email)).get();
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    const eh = emailHash(email);

    if (!user || !ok) {
      await hitLoginLimiter(key);
      withTx((tx) =>
        writeAudit(tx, {
          actorId: user?.id ?? null,
          action: 'auth.login_failed',
          entity: 'user',
          entityId: user?.id ?? eh,
          ip,
          meta: { emailHash: eh },
        }),
      );
      return invalid();
    }
    if (!user.isActive) {
      return NextResponse.json(
        { error: { code: 'ACCOUNT_DISABLED', message: 'This account is disabled' } },
        { status: 403 },
      );
    }

    await resetLoginLimiter(key);
    const token = await signSession({
      sub: user.id,
      role: user.role,
      teamId: user.teamId,
      name: user.name,
      tv: user.tokenVersion,
      jti: ulid(),
    });
    withTx((tx) =>
      writeAudit(tx, {
        actorId: user.id,
        action: 'auth.login',
        entity: 'user',
        entityId: user.id,
        ip,
      }),
    );
    const res = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        teamId: user.teamId,
        home: roleHome(user.role),
      },
    });
    res.headers.append('Set-Cookie', sessionSetCookie(token));
    return res;
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
