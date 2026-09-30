import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';

describe('activity cursor', () => {
  it('round-trips', () => {
    const c = { createdAt: 1_790_000_000_000, id: '01HZXABCDEF' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
  it('rejects invalid input', () => {
    for (const bad of ['', '!!!', 'abc', Buffer.from('x:y:z').toString('base64url'), 'a b']) {
      expect(decodeCursor(bad)).toBeNull();
    }
    expect(decodeCursor(Buffer.from('12:').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from('ab:ID1').toString('base64url'))).toBeNull();
  });
});
