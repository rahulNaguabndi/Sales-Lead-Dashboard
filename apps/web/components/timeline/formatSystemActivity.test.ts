import { describe, expect, it } from 'vitest';
import { formatSystemActivity as f } from './formatSystemActivity';

describe('formatSystemActivity', () => {
  it('formats every system type', () => {
    expect(f('LEAD_CREATED', { source: 'TEST_DRIVE_BOOKING' })).toBe(
      'Lead created from Test drive booking',
    );
    expect(f('LEAD_CREATED', null)).toBe('Lead created');
    expect(f('STAGE_CHANGED', { from: 'NEW', to: 'CONTACTED' })).toBe(
      'Stage changed from New to Contacted',
    );
    expect(f('STAGE_CHANGED', {})).toBe('Stage changed');
    expect(f('ASSIGNED', { toName: 'Anna' })).toBe('Assigned to Anna');
    expect(f('CLAIMED', { byName: 'Anna' })).toBe('Claimed by Anna');
    expect(f('CLAIMED', undefined)).toBe('Lead claimed');
    expect(f('FOLLOW_UP_SCHEDULED', {})).toBe('Follow-up scheduled');
    expect(f('FOLLOW_UP_MISSED', {})).toBe('Follow-up missed');
    expect(f('AUTO_COLD', {})).toMatch(/cold/);
    expect(f('OFFER_APPLIED', { title: 'Spring' })).toBe('Offer applied: Spring');
    expect(f('SCORE_CHANGED', { from: 10, to: 40 })).toBe('Score changed from 10 to 40');
  });
  it('humanizes unknown types instead of showing raw enums', () => {
    expect(f('SOMETHING_NEW', { a: 1 })).toBe('Something new');
  });
});
