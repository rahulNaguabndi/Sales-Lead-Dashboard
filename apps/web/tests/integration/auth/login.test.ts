import { beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, PASSWORD, req, setupAuthEnv, SOFIA } from './helpers';

let login: typeof import('@/app/api/auth/login/route').POST;
let sqlite: import('better-sqlite3').Database;

beforeAll(async () => {
  await setupAuthEnv();
  login = (await import('@/app/api/auth/login/route')).POST;
  const { openDatabase } = await import('@/server/db/client');
  sqlite = openDatabase(process.env.DATABASE_URL!).sqlite;
});

const post = (body: unknown, ip = '9.9.9.9') =>
  login(req('/api/auth/login', { method: 'POST', body, headers: { 'x-forwarded-for': ip } }));

describe('POST /api/auth/login', () => {
  it('signs in, sets a hardened cookie, and never returns the token', async () => {
    const res = await post({ email: ` ${SOFIA.toUpperCase()} `, password: PASSWORD }, '1.0.0.1');
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=28800');
    const body = await res.json();
    expect(body.user).toMatchObject({ role: 'REP', home: '/inbox' });
    expect(JSON.stringify(body)).not.toContain(cookieFrom(res).split('=')[1]!);
    expect(
      sqlite.prepare("select count(*) n from audit_log where action='auth.login'").get(),
    ).toMatchObject({ n: 1 });
  });

  it('gives identical 401s for unknown email and wrong password, hashing the email in audit', async () => {
    const a = await post({ email: 'nobody@eurodrive.test', password: 'x' }, '1.0.0.2');
    const b = await post({ email: SOFIA, password: 'wrong' }, '1.0.0.3');
    expect(a.status).toBe(401);
    expect(await a.text()).toBe(await b.text());
    const rows = sqlite
      .prepare("select meta, entity_id from audit_log where action='auth.login_failed'")
      .all() as { meta: string; entity_id: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(rows)).not.toContain('nobody@eurodrive.test');
  });

  it('rejects disabled accounts only with the correct password', async () => {
    sqlite.prepare('update users set is_active=0 where email=?').run('anna.weber@eurodrive.test');
    const wrong = await post({ email: 'anna.weber@eurodrive.test', password: 'nope' }, '1.0.0.4');
    expect(wrong.status).toBe(401);
    const right = await post({ email: 'anna.weber@eurodrive.test', password: PASSWORD }, '1.0.0.5');
    expect(right.status).toBe(403);
    expect((await right.json()).error.code).toBe('ACCOUNT_DISABLED');
  });

  it('returns 400 for non-JSON or invalid bodies', async () => {
    const res = await post('not json', '1.0.0.6');
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
    expect((await post({ email: SOFIA }, '1.0.0.6')).status).toBe(400);
  });

  it('rate limits the 6th failure and success resets the counter', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post({ email: SOFIA, password: 'bad' }, '2.0.0.1')).status).toBe(401);
    }
    const blocked = await post({ email: SOFIA, password: 'bad' }, '2.0.0.1');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);

    for (let i = 0; i < 4; i++) await post({ email: SOFIA, password: 'bad' }, '2.0.0.2');
    expect((await post({ email: SOFIA, password: PASSWORD }, '2.0.0.2')).status).toBe(200);
    for (let i = 0; i < 4; i++) {
      expect((await post({ email: SOFIA, password: 'bad' }, '2.0.0.2')).status).toBe(401);
    }
  });
});
