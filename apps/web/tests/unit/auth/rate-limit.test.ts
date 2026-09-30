import { describe, expect, it } from 'vitest';
import {
  checkLoginLimiter,
  hitLoginLimiter,
  loginKey,
  resetLoginLimiter,
  LOGIN_WINDOW_SECONDS,
} from '@/server/auth/rate-limit';

// Redis is not connected in unit tests, so this exercises the in-memory degraded path.
describe('login rate limiter', () => {
  it('blocks after 5 failures with retryAfter', async () => {
    const k = loginKey('1.1.1.1', 'a@x.test');
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect((await checkLoginLimiter(k, now)).blocked).toBe(false);
      await hitLoginLimiter(k, now);
    }
    const r = await checkLoginLimiter(k, now);
    expect(r.blocked).toBe(true);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });
  it('keys are separate per ip+email', async () => {
    const a = loginKey('2.2.2.2', 'a@x.test');
    for (let i = 0; i < 5; i++) await hitLoginLimiter(a);
    expect((await checkLoginLimiter(loginKey('2.2.2.3', 'a@x.test'))).blocked).toBe(false);
    expect((await checkLoginLimiter(loginKey('2.2.2.2', 'b@x.test'))).blocked).toBe(false);
  });
  it('window expires and success resets', async () => {
    const k = loginKey('3.3.3.3', 'a@x.test');
    const now = 5_000_000;
    for (let i = 0; i < 5; i++) await hitLoginLimiter(k, now);
    expect((await checkLoginLimiter(k, now + LOGIN_WINDOW_SECONDS * 1000 + 1)).blocked).toBe(false);
    for (let i = 0; i < 5; i++) await hitLoginLimiter(k);
    await resetLoginLimiter(k);
    expect((await checkLoginLimiter(k)).blocked).toBe(false);
  });
});
