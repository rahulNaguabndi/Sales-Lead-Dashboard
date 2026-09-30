import { describe, expect, it } from 'vitest';
import { fingerprint } from '@/server/services/ai/fingerprint';
import { makeCtx } from './fixture';

const offer = (id: string) => ({ id, title: id, description: '', reasons: [] });

describe('fingerprint', () => {
  it('is stable for the same inputs', () => {
    expect(fingerprint(makeCtx())).toBe(fingerprint(makeCtx()));
  });
  it('ignores offer order', () => {
    const a = makeCtx({ offers: [offer('a'), offer('b')] });
    const b = makeCtx({ offers: [offer('b'), offer('a')] });
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
  it('changes with version, last activity, offers and channel', () => {
    const base = fingerprint(makeCtx());
    expect(fingerprint(makeCtx({ meta: { leadId: 'lead1', version: 4, lastActivityAt: 1 } }))).not.toBe(base);
    expect(fingerprint(makeCtx({ meta: { leadId: 'lead1', version: 3, lastActivityAt: 99 } }))).not.toBe(base);
    expect(fingerprint(makeCtx({ offers: [offer('a')] }))).not.toBe(base);
    expect(fingerprint(makeCtx(), 'EMAIL')).not.toBe(base);
    expect(fingerprint(makeCtx(), 'EMAIL')).not.toBe(fingerprint(makeCtx(), 'SMS'));
  });
});
