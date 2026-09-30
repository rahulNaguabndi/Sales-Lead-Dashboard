import { describe, expect, it } from 'vitest';
import { bannerFor, mapValidation } from './errors';

describe('bannerFor', () => {
  it('maps each error kind to contract copy', () => {
    expect(bannerFor({ kind: 'network' })).toBe("We couldn't send your enquiry. Please try again.");
    expect(bannerFor({ kind: 'server', status: 500 })).toBe(
      "We couldn't send your enquiry. Please try again.",
    );
    expect(bannerFor({ kind: 'rate_limited' })).toMatch(/Too many enquiries/);
    expect(bannerFor({ kind: 'unauthorized' })).toMatch(/misconfigured/);
    expect(bannerFor({ kind: 'too_large' })).toMatch(/too large/);
    expect(bannerFor({ kind: 'timeout' })).toMatch(/timed out/);
    expect(bannerFor({ kind: 'validation', fields: [] })).toBeNull();
  });
});

describe('mapValidation', () => {
  it('maps paths to form fields', () => {
    const r = mapValidation({
      kind: 'validation',
      fields: [
        { path: 'email', message: 'bad email' },
        { path: 'phone', message: 'bad phone' },
      ],
    });
    expect(r.fields).toEqual({ email: 'bad email', phoneDigits: 'bad phone' });
    expect(r.banner).toBeNull();
  });
  it('unmapped path → banner', () => {
    const r = mapValidation({ kind: 'validation', fields: [{ path: 'idempotencyKey', message: 'x' }] });
    expect(r.banner).not.toBeNull();
  });
});
