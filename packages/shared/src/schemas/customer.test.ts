import { describe, expect, it } from 'vitest';
import { PatchPreferencesSchema } from './customer';

describe('PatchPreferencesSchema', () => {
  it('requires leadId and at least one preference', () => {
    expect(PatchPreferencesSchema.safeParse({ leadId: 'l1' }).success).toBe(false);
    expect(PatchPreferencesSchema.safeParse({ preferredChannel: 'CALL' }).success).toBe(false);
    expect(
      PatchPreferencesSchema.safeParse({ leadId: 'l1', preferredChannel: 'CALL' }).success,
    ).toBe(true);
  });
  it('validates enums and languages', () => {
    expect(
      PatchPreferencesSchema.safeParse({ leadId: 'l1', preferredChannel: 'FAX' }).success,
    ).toBe(false);
    expect(PatchPreferencesSchema.safeParse({ leadId: 'l1', bestTime: 'NIGHT' }).success).toBe(
      false,
    );
    expect(PatchPreferencesSchema.safeParse({ leadId: 'l1', language: 'xx' }).success).toBe(false);
    expect(PatchPreferencesSchema.safeParse({ leadId: 'l1', language: 'it' }).success).toBe(true);
  });
  it('rejects secondary equal to preferred but allows null secondary', () => {
    expect(
      PatchPreferencesSchema.safeParse({
        leadId: 'l1',
        preferredChannel: 'SMS',
        secondaryChannel: 'SMS',
      }).success,
    ).toBe(false);
    expect(PatchPreferencesSchema.safeParse({ leadId: 'l1', secondaryChannel: null }).success).toBe(
      true,
    );
  });
});
