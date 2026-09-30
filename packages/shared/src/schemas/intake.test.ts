import { describe, expect, it } from 'vitest';
import { IntakeLeadSchema } from './intake';

const valid = {
  firstName: 'Anna',
  lastName: 'Schmidt',
  email: 'Anna@Example.com',
  phone: '+49 170 1234567',
  country: 'DE',
  language: 'de',
  preferredChannel: 'WHATSAPP',
  vehicleModel: 'aurora-suv',
  budgetMin: 2000000,
  budgetMax: 4000000,
};

const issuePaths = (input: unknown) => {
  const r = IntakeLeadSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('IntakeLeadSchema', () => {
  it('accepts a valid full payload and applies defaults', () => {
    const r = IntakeLeadSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('anna@example.com');
      expect(r.data.source).toBe('WEBSITE');
      expect(r.data.bestTime).toBe('ANYTIME');
      expect(r.data.hasTradeIn).toBe(false);
    }
  });

  it('rejects a payload with neither email nor phone', () => {
    const { email: _e, phone: _p, ...rest } = valid;
    expect(issuePaths(rest)).toContain('email');
  });

  it('requires a phone for WHATSAPP preferred channel', () => {
    const { phone: _p, ...rest } = valid;
    expect(issuePaths(rest)).toContain('preferredChannel');
  });

  it('requires an email for EMAIL preferred channel', () => {
    const { email: _e, ...rest } = valid;
    expect(issuePaths({ ...rest, preferredChannel: 'EMAIL' })).toContain('preferredChannel');
  });

  it('rejects budgetMin greater than budgetMax', () => {
    expect(issuePaths({ ...valid, budgetMin: 5000000, budgetMax: 1000000 })).toContain('budgetMin');
  });

  it('still parses when the honeypot field is filled (F10 rejects it)', () => {
    expect(IntakeLeadSchema.safeParse({ ...valid, website: 'http://spam' }).success).toBe(true);
  });
});
