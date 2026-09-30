import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

let middleware: typeof import('@/middleware').middleware;
let signSession: typeof import('@/server/auth/jwt').signSession;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-'.padEnd(40, 'x');
  middleware = (await import('@/middleware')).middleware;
  signSession = (await import('@/server/auth/jwt')).signSession;
});

const PUBLIC_API = ['/api/auth/login', '/api/auth/logout', '/api/intake'];

function apiRoutes(dir = path.resolve(__dirname, '../../../app/api'), base = '/api'): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const seg = e.name.replace(/^\[.+\]$/, 'x');
      out.push(...apiRoutes(path.join(dir, e.name), `${base}/${seg}`));
    } else if (e.name === 'route.ts') out.push(base);
  }
  return out;
}

const call = (url: string, init: { method?: string; cookie?: string; origin?: string } = {}) => {
  const headers: Record<string, string> = { host: 'localhost' };
  if (init.cookie) headers.cookie = init.cookie;
  if (init.origin) headers.origin = init.origin;
  return middleware(new NextRequest(`http://localhost${url}`, { method: init.method, headers }));
};

const validToken = () =>
  signSession({ sub: 'u', role: 'REP', teamId: null, name: 'n', tv: 0, jti: 'j' });

describe('gateway', () => {
  it('returns 401 UNAUTHENTICATED for every non-public API route without a session', async () => {
    const routes = apiRoutes().filter((r) => !PUBLIC_API.some((p) => r.startsWith(p)));
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      const res = await call(r);
      expect(res.status, r).toBe(401);
      expect((await res.json()).error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('redirects pages to /login with next and clears invalid cookies', async () => {
    const res = await call('/inbox?x=1');
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('next')).toBe('/inbox?x=1');
    const bad = await call('/inbox', { cookie: 'ld_session=garbage' });
    expect(new URL(bad.headers.get('location')!).searchParams.get('expired')).toBe('1');
    expect(bad.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('treats a tampered token as no session', async () => {
    const t = await validToken();
    const res = await call('/api/leads/x/activities', { cookie: `ld_session=${t}x` });
    expect(res.status).toBe(401);
  });

  it('lets valid sessions and public paths through', async () => {
    const res = await call('/inbox', { cookie: `ld_session=${await validToken()}` });
    expect(res.headers.get('x-middleware-next')).toBe('1');
    for (const p of ['/login', '/api/auth/login', '/api/intake/web']) {
      expect((await call(p)).headers.get('x-middleware-next'), p).toBe('1');
    }
  });

  it('rejects foreign-origin mutations except on intake', async () => {
    const cookie = `ld_session=${await validToken()}`;
    const bad = await call('/api/leads/x/activities', {
      method: 'POST',
      cookie,
      origin: 'http://evil.test',
    });
    expect(bad.status).toBe(403);
    expect((await bad.json()).error.code).toBe('BAD_ORIGIN');
    const ok = await call('/api/leads/x/activities', {
      method: 'POST',
      cookie,
      origin: 'http://localhost',
    });
    expect(ok.headers.get('x-middleware-next')).toBe('1');
    const intake = await call('/api/intake/web', { method: 'POST', origin: 'http://evil.test' });
    expect(intake.headers.get('x-middleware-next')).toBe('1');
  });
});
