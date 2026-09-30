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
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(ms));
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
