import { describe, expect, it } from 'vitest';
import { buildDiff, fieldLabel, formatValue } from './labels';

describe('audit labels', () => {
  it('labels fields and stage enums', () => {
    expect(fieldLabel('ownerId')).toBe('Owner');
    expect(fieldLabel('someCustomField')).toBe('Some custom field');
    expect(formatValue('stage', 'TEST_DRIVE').text).toBe('Test drive');
  });
  it('formats money, timestamps and resolved refs', () => {
    expect(formatValue('value', 150000).text).toMatch(/1.500/);
    expect(formatValue('dueAt', 1759240000000).text).toMatch(/2025/);
    expect(formatValue('ownerId', 'u1', { ownerId: { u1: 'Anna' } }).text).toBe('Anna');
    expect(formatValue('ownerId', null).text).toBe('—');
  });
  it('truncates long values at 500 chars', () => {
    const r = formatValue('note', 'x'.repeat(900));
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBe(501);
  });
  it('diff marks changed keys first; create has only after', () => {
    const d = buildDiff({ stage: 'NEW', score: 1 }, { stage: 'QUALIFIED', score: 1 });
    expect(d.rows[0]).toMatchObject({ key: 'stage', changed: true, before: 'New', after: 'Qualified' });
    expect(d.rows[1]!.changed).toBe(false);
    const c = buildDiff(null, { stage: 'NEW' });
    expect(c.rows[0]).toMatchObject({ before: '—', after: 'New', changed: true });
  });
  it('malformed payload falls back to raw', () => {
    expect(buildDiff(null, '{not json').raw).toBe('{not json');
  });
});
