import { describe, expect, it } from 'vitest';
import { roleHome, sanitizeNext } from '@/server/auth/next-path';

describe('sanitizeNext', () => {
  it('accepts same-origin paths', () => {
    expect(sanitizeNext('/leads/1', 'REP')).toBe('/leads/1');
    expect(sanitizeNext('/inbox?x=1', 'REP')).toBe('/inbox?x=1');
  });
  it.each(['//evil.com', 'https://x', '/\\evil', '', null, undefined, 'javascript:1'])(
    'rejects %s',
    (v) => {
      expect(sanitizeNext(v as string | null | undefined, 'MANAGER')).toBe('/dashboard');
    },
  );
  it('maps roles to home', () => {
    expect(roleHome('REP')).toBe('/inbox');
    expect(roleHome('MANAGER')).toBe('/dashboard');
    expect(roleHome('VP')).toBe('/dashboard');
  });
});
