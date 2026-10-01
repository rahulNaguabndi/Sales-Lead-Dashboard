const LOCALE = 'de-DE';

const eur = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Euro cents to "38.900 €". */
export function formatEUR(cents: number): string {
  return eur.format(cents / 100);
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Human-readable relative time, e.g. "2 hours ago", "yesterday". */
export function formatRelative(ms: number, now: number = Date.now()): string {
  const diffSec = Math.round((ms - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 45 * 60) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 22 * 3600) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 26 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (abs < 320 * 86400) return rtf.format(Math.round(diffSec / (30 * 86400)), 'month');
  return rtf.format(Math.round(diffSec / (365 * 86400)), 'year');
}

/** 24-hour date-time, e.g. "30 Sep 2026, 14:32" (UTC unless a timeZone is given). */
export function formatDateTime(ms: number, timeZone = 'UTC'): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(ms));
  return `${formatDate(ms, { timeZone })}, ${time}`;
}

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

export function buildCustomerSearchText(c: {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
}): string {
  const text = `${c.firstName} ${c.lastName} ${c.email ?? ''} ${(c.phone ?? '').replace(/\D/g, '')}`;
  return stripDiacritics(text.toLowerCase()).trim();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The one date style: "2 Sep 2026" (or "2 Sep" without the year). Accepts unix ms or a
 * "YYYY-MM-DD" day key. Months are fixed three-letter names, because ICU renders September as
 * "Sept" in en-GB, which made dates look different from screen to screen.
 */
export function formatDate(
  input: number | string,
  opts: { year?: boolean; timeZone?: string } = {},
): string {
  const { year = true, timeZone = 'UTC' } = opts;
  let y: number;
  let m: number;
  let d: number;
  if (typeof input === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
    if (!match) return input;
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(input));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    [y, m, d] = [get('year'), get('month'), get('day')];
  }
  return `${d} ${MONTHS[m - 1]}${year ? ` ${y}` : ''}`;
}
