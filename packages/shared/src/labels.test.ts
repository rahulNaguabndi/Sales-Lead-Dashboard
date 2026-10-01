import { describe, expect, it } from 'vitest';
import { LEAD_SOURCES, LOST_REASONS, STAGES } from './enums';
import { SOURCE_GROUPS } from './source-groups';
import {
  channelLabel,
  humanize,
  languageLabel,
  lostReasonLabel,
  sourceGroupLabel,
  sourceLabel,
  stageLabel,
  vehicleName,
} from './labels';

const RAW = /^[A-Z_]+$/;

describe('labels', () => {
  it('has a readable label for every enum value (no SHOUTING_SNAKE in the UI)', () => {
    for (const s of STAGES) expect(stageLabel(s)).not.toMatch(RAW);
    for (const s of LEAD_SOURCES) expect(sourceLabel(s)).not.toMatch(RAW);
    for (const g of SOURCE_GROUPS) expect(sourceGroupLabel(g)).not.toMatch(RAW);
    for (const r of LOST_REASONS) expect(lostReasonLabel(r)).not.toMatch(RAW);
  });

  it('uses one spelling per value', () => {
    expect(sourceLabel('GOOGLE_ADS')).toBe('Google Ads');
    expect(sourceLabel('WALK_IN')).toBe('Walk-in');
    expect(channelLabel('WHATSAPP')).toBe('WhatsApp');
    expect(stageLabel('TEST_DRIVE')).toBe('Test drive');
    expect(lostReasonLabel('BOUGHT_ELSEWHERE')).toBe('Bought elsewhere');
  });

  it('turns vehicle slugs into names and missing models into one placeholder', () => {
    expect(vehicleName('nova-van')).toBe('Nova Van');
    expect(vehicleName(null)).toBe('—');
    expect(vehicleName('mystery-car')).toBe('Mystery car');
  });

  it('humanizes unknown values instead of leaking them', () => {
    expect(stageLabel('SOMETHING_NEW')).toBe('Something new');
    expect(humanize('AUTO_COLD')).toBe('Auto cold');
    expect(languageLabel('en')).toBe('EN');
  });
});
