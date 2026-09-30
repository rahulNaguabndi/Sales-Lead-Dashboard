import { beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, PASSWORD, req, setupAuthEnv, SOFIA } from './helpers';

let login: typeof import('@/app/api/auth/login/route').POST;
let logout: typeof import('@/app/api/auth/logout/route').POST;
let me: typeof import('@/app/api/auth/me/route').GET;
let session: typeof import('@/server/auth/session');
let sqlite: import('better-sqlite3').Database;

beforeAll(async () => {
  await setupAuthEnv();
  login = (await import('@/app/api/auth/login/route')).POST;
  logout = (await import('@/app/api/auth/logout/route')).POST;
  me = (await import('@/app/api/auth/me/route')).GET;
  session = await import('@/server/auth/session');
  const { openDatabase } = await import('@/server/db/client');
  sqlite = openDatabase(process.env.DATABASE_URL!).sqlite;
});

async function signIn(email = SOFIA, ip = '5.5.5.5') {
  const res = await login(
    req('/api/auth/login', {
      method: 'POST',
      body: { email, password: PASSWORD },
      headers: { 'x-forwarded-for': ip },
    }),
  );
  return cookieFrom(res);
}

const callMe = (cookie?: string) => me(req('/api/auth/me', { cookie }));

describe('GET /api/auth/me and session validation', () => {
  it('returns the user for a valid session and 401 UNAUTHENTICATED otherwise', async () => {
    const cookie = await signIn();
    const ok = await callMe(cookie);
    expect(ok.status).toBe(200);
    expect((await ok.json()).user.email).toBe(SOFIA);
    const no = await callMe();
    expect(no.status).toBe(401);
    expect((await no.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it('reads role from the database, not the token', async () => {
    const email = 'lukas.becker@eurodrive.test';
    const cookie = await signIn(email, '5.5.5.6');
    sqlite.prepare("update users set role='REP' where email=?").run(email);
    expect((await (await callMe(cookie)).json()).user.role).toBe('REP');
  });

  it('revokeAllSessions invalidates older tokens', async () => {
    const email = 'marta.garcia@eurodrive.test';
    const cookie = await signIn(email, '5.5.5.7');
    expect((await callMe(cookie)).status).toBe(200);
    const row = sqlite.prepare('select id from users where email=?').get(email) as { id: string };
    session.revokeAllSessions(row.id);
    expect((await callMe(cookie)).status).toBe(401);
  });

  it('rejects deactivated users', async () => {
    const email = 'luca.romano@eurodrive.test';
    const cookie = await signIn(email, '5.5.5.8');
    sqlite.prepare('update users set is_active=0 where email=?').run(email);
    expect((await callMe(cookie)).status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie, is idempotent and revokes the token (Redis degraded, in-process)', async () => {
    const cookie = await signIn(SOFIA, '5.5.5.9');
    const res = await logout(req('/api/auth/logout', { method: 'POST', cookie }));
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await logout(req('/api/auth/logout', { method: 'POST' }))).status).toBe(204);
    expect((await callMe(cookie)).status).toBe(401);
    expect(
      sqlite.prepare("select count(*) n from audit_log where action='auth.logout'").get(),
    ).toMatchObject({ n: 1 });
  });
});

describe('secrets hygiene', () => {
  it('audit rows never contain plaintext password', () => {
    const rows = JSON.stringify(sqlite.prepare('select * from audit_log').all());
    expect(rows).not.toContain(PASSWORD);
  });
});
