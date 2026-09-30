// F16 (dashboards) is not on this branch yet. Minimal local stand-ins with the names F16 will export,
// so merging F16 only swaps these imports. Delete this file once F16's period resolver lands.
import type { DemographicsRange } from '@leaddesk/shared';

const DAY = 86_400_000;

export type ResolvedPeriod = { from: number; to: number; range: DemographicsRange };

export function resolvePeriod(
  range: DemographicsRange,
  custom: { from?: number; to?: number } = {},
  now = Date.now(),
): ResolvedPeriod {
  if (range === 'custom') return { from: custom.from ?? now - 90 * DAY, to: custom.to ?? now, range };
  if (range === 'today') {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return { from: start.getTime(), to: now, range };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return { from: now - days * DAY, to: now, range };
}
