import { IntakeLeadSchema } from '@leaddesk/shared';
import { describe, expect, it } from 'vitest';
import { buildPayload, defaultValues, validateEnquiry, type EnquiryFormValues } from './payload';

const base = (over: Partial<EnquiryFormValues> = {}): EnquiryFormValues => ({
  ...defaultValues(),
  firstName: 'Anna',
  lastName: 'Keller',
  email: 'anna@example.com',
  phoneDigits: '151 1234 5678',
  vehicleModel: 'aurora-suv',
  budget: '30_40',
  ...over,
});

describe('buildPayload', () => {
  it('produces an IntakeLead accepted by the shared schema', () => {
    const p = buildPayload(base(), { source: 'INSTAGRAM', sourceDetail: 'autumn-suv' });
    expect(IntakeLeadSchema.safeParse(p).success).toBe(true);
    expect(p.phone).toBe('+4915112345678');
    expect(p.budgetMin).toBe(3_000_000);
    expect(p.source).toBe('INSTAGRAM');
    expect(p.sourceDetail).toBe('autumn-suv');
    expect(p.ageBand).toBe('UNKNOWN');
  });
  it('omits vehicleModel for "Not sure yet" and empty strings', () => {
    const p = buildPayload(base({ vehicleModel: '', city: '', message: '' }));
    expect(p).not.toHaveProperty('vehicleModel');
    expect(p).not.toHaveProperty('city');
    expect(p).not.toHaveProperty('message');
  });
});

describe('validateEnquiry', () => {
  it('passes a valid form', () => {
    expect(validateEnquiry(base()).ok).toBe(true);
  });
  it('requires phone for phone channels', () => {
    for (const ch of ['CALL', 'WHATSAPP', 'SMS'] as const) {
      const r = validateEnquiry(base({ preferredChannel: ch, phoneDigits: '' }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.phoneDigits).toBeDefined();
    }
  });
  it('requires email for EMAIL channel', () => {
    const r = validateEnquiry(base({ preferredChannel: 'EMAIL', email: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBeDefined();
  });
  it('both empty → combined message', () => {
    const r = validateEnquiry(base({ email: '', phoneDigits: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBe('Please give us an email or phone number.');
  });
});

describe('validateEnquiry phone check', () => {
  it('rejects a number the API would reject, next to the phone field', async () => {
    const { defaultValues, validateEnquiry } = await import('./payload');
    const v = {
      ...defaultValues(),
      firstName: 'Ana',
      lastName: 'Test',
      country: 'CH' as const,
      dial: '+41',
      phoneDigits: '123',
      preferredChannel: 'CALL' as const,
    };
    const r = validateEnquiry(v);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phoneDigits).toMatch(/valid Switzerland phone number/);
  });
});
