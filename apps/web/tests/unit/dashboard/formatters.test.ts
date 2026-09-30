import { describe, expect, it } from 'vitest';
import { describeDelta, formatDuration, formatPct } from '@/components/dashboard/formatters';

describe('dashboard formatters', () => {
  it('humanizes durations', () => {
    expect(formatDuration(42)).toBe('42 min');
    expect(formatDuration(185)).toBe('3 h 5 min');
    expect(formatDuration(1680)).toBe('1 d 4 h');
    expect(formatDuration(null)).toBe('—');
  });
  it('formats percentages with one decimal', () => {
    expect(formatPct(12.345)).toBe('12.3%');
    expect(formatPct(null)).toBe('—');
  });
  it('inverts good/bad when lower is better', () => {
    expect(describeDelta(12, 10, false).good).toBe(true);
    expect(describeDelta(12, 10, true).good).toBe(false);
    expect(describeDelta(5, null).text).toBe('New');
    expect(describeDelta(null, 5).direction).toBe('none');
    expect(describeDelta(60, 50, false, 'pct-points').text).toBe('+10.0 pp');
  });
});
