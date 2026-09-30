import { describe, expect, it } from 'vitest';
import { signSession, verifySession } from '@/server/auth/jwt';

const secret = 'a'.repeat(40);
const base = { sub: 'u1', role: 'REP' as const, teamId: 't1', name: 'Sofia', tv: 0, jti: 'j1' };

describe('jwt', () => {
  it('round-trips claims with 8h expiry', async () => {
    const now = Date.now();
    const token = await signSession(base, { now, secret });
    const c = await verifySession(token, { now, secret });
    expect(c).toMatchObject(base);
    expect(c!.exp - c!.iat).toBe(28800);
  });
  it('rejects expired tokens beyond tolerance', async () => {
    const now = Date.now();
    const token = await signSession(base, { now, secret });
    expect(await verifySession(token, { now: now + 28800_000 + 60_000, secret })).toBeNull();
  });
  it('accepts within 30s clock tolerance', async () => {
    const now = Date.now();
    const token = await signSession(base, { now, secret });
    expect(await verifySession(token, { now: now + 28800_000 + 10_000, secret })).not.toBeNull();
  });
  it('rejects tampered and wrong-secret tokens', async () => {
    const token = await signSession(base, { secret });
    const bad = token.slice(0, -2) + (token.endsWith('AA') ? 'BB' : 'AA');
    expect(await verifySession(bad, { secret })).toBeNull();
    expect(await verifySession(token, { secret: 'b'.repeat(40) })).toBeNull();
    expect(await verifySession('garbage', { secret })).toBeNull();
  });
});
