import type { BestTime } from './enums';

const ZONES: Record<string, string> = {
  DE: 'Europe/Berlin',
  AT: 'Europe/Vienna',
  CH: 'Europe/Zurich',
  FR: 'Europe/Paris',
  BE: 'Europe/Brussels',
  NL: 'Europe/Amsterdam',
  LU: 'Europe/Luxembourg',
  IT: 'Europe/Rome',
  ES: 'Europe/Madrid',
  PT: 'Europe/Lisbon',
};

export const DEFAULT_TIMEZONE = 'Europe/Berlin';

export function timezoneForCountry(country: string): string {
  return ZONES[country] ?? DEFAULT_TIMEZONE;
}

/** [startHour, endHour) in the customer's local time. */
export const BEST_TIME_WINDOWS: Record<Exclude<BestTime, 'ANYTIME'>, [number, number]> = {
  MORNING: [8, 12],
  AFTERNOON: [12, 17],
  EVENING: [17, 20],
};

const LABEL: Record<Exclude<BestTime, 'ANYTIME'>, string> = {
  MORNING: 'mornings',
  AFTERNOON: 'afternoons',
  EVENING: 'evenings',
};

function localTime(zone: string, now: number): { hour: number; text: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return { hour: Number(hh), text: `${hh}:${mm}` };
}

/** Null when no hint applies (ANYTIME or already inside the preferred window). */
export function bestTimeHint(
  bestTime: BestTime,
  country: string,
  place: string,
  now: number = Date.now(),
): string | null {
  if (bestTime === 'ANYTIME') return null;
  const { hour, text } = localTime(timezoneForCountry(country), now);
  const [start, end] = BEST_TIME_WINDOWS[bestTime];
  if (hour >= start && hour < end) return null;
  return `Customer prefers ${LABEL[bestTime]} (it's ${text} in ${place})`;
}
