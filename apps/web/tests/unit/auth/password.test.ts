import { describe, expect, it } from 'vitest';
import { DUMMY_HASH, hashPassword, verifyPassword } from '@/server/auth/password';

describe('password', () => {
  it('hashes and verifies', async () => {
    const h = hashPassword('demo1234');
    expect(h).not.toBe('demo1234');
    expect(await verifyPassword('demo1234', h)).toBe(true);
    expect(await verifyPassword('nope', h)).toBe(false);
  });
  it('DUMMY_HASH never verifies', async () => {
    expect(await verifyPassword('demo1234', DUMMY_HASH)).toBe(false);
  });
});
