import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const ok = { DATABASE_URL: './data/x.db', JWT_SECRET: 'x'.repeat(32) };

describe('validateEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = validateEnv(ok);
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.COLD_AFTER_DAYS).toBe(7);
    expect(env.JOBS_ENABLED).toBe(true);
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(() => validateEnv({ ...ok, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects a missing DATABASE_URL, listing every problem', () => {
    expect(() => validateEnv({ JWT_SECRET: 'short' })).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET/);
  });
});
