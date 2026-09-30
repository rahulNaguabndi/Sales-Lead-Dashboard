import { DASHBOARD_TZ, type DashboardFilters, type DashboardPeriod } from '@leaddesk/shared';
import { AppError } from '../http/errors';

export class InvalidRangeError extends AppError {
  readonly statusCode = 400;
  readonly code = 'INVALID_RANGE';
}
export class InvalidFilterError extends AppError {
  readonly statusCode = 400;
  readonly code = 'INVALID_FILTER';
}
export class OutOfScopeError extends AppError {
  readonly statusCode = 403;
  readonly code = 'OUT_OF_SCOPE';
  constructor(message = 'Requested data is outside your scope') {
    super(message);
  }
}

const DAY = 86_400_000;
const MAX_RANGE_DAYS = 366;
const WEEK_BUCKET_AFTER_DAYS = 60;

/** Average days in stage above which the bar is emphasised (constants; no quota management). */
export const STAGE_AGING_TARGETS: Record<string, number> = {
  NEW: 3,
  CONTACTED: 3,
  QUALIFIED: 7,
  TEST_DRIVE: 7,
  NEGOTIATION: 7,
};

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: DASHBOARD_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function localParts(ts: number) {
  const o: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(new Date(ts))) {
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  }
  return o as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

/** Brussels offset from UTC at `ts`, in ms. */
function offsetMs(ts: number): number {
  const p = localParts(ts);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO date (YYYY-MM-DD) of `ts` in the org timezone. */
export function dayKey(ts: number): string {
  const p = localParts(ts);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function parseIso(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(t).toISOString().slice(0, 10) === date ? t : null;
}

export function addDays(date: string, n: number): string {
  const t = parseIso(date);
  if (t === null) throw new InvalidRangeError(`Invalid date ${date}`);
  return new Date(t + n * DAY).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b)! - parseIso(a)!) / DAY);
}

/** UTC ms of local midnight for a Brussels calendar date. */
export function zonedDayStart(date: string): number {
  const guess = parseIso(date);
  if (guess === null) throw new InvalidRangeError(`Invalid date ${date}`);
  return guess - offsetMs(guess - offsetMs(guess));
}

/** Resolves a range preset or custom dates into the period and the equal-length previous one. */
export function resolvePeriod(
  f: Pick<DashboardFilters, 'range' | 'from' | 'to'>,
  now: number,
): DashboardPeriod {
  const today = dayKey(now);
  let fromDate: string;
  let toDate = today;
  switch (f.range) {
    case 'today':
      fromDate = today;
      break;
    case '7d':
      fromDate = addDays(today, -6);
      break;
    case '30d':
      fromDate = addDays(today, -29);
      break;
    case '90d':
      fromDate = addDays(today, -89);
      break;
    case 'mtd':
      fromDate = `${today.slice(0, 8)}01`;
      break;
    case 'custom': {
      if (!f.from || !f.to || parseIso(f.from) === null || parseIso(f.to) === null) {
        throw new InvalidRangeError('A valid from and to date are required');
      }
      fromDate = f.from;
      toDate = f.to;
      if (fromDate > toDate) throw new InvalidRangeError('from must not be after to');
      if (daysBetween(fromDate, toDate) + 1 > MAX_RANGE_DAYS) {
        throw new InvalidRangeError('Custom range cannot exceed 366 days');
      }
      break;
    }
  }
  const days = daysBetween(fromDate, toDate) + 1;
  const from = zonedDayStart(fromDate);
  const to = zonedDayStart(addDays(toDate, 1)) - 1;
  return {
    from,
    to,
    prevFrom: zonedDayStart(addDays(fromDate, -days)),
    prevTo: from - 1,
    tz: DASHBOARD_TZ,
    fromDate,
    toDate,
  };
}

export type Delta = {
  abs: number | null;
  pct: number | null;
  direction: 'up' | 'down' | 'flat' | 'new' | 'none';
  /** null when there is no judgement to make (flat, new, none). */
  good: boolean | null;
};

export function computeDelta(
  value: number | null,
  prev: number | null,
  lowerIsBetter = false,
): Delta {
  if (value === null) return { abs: null, pct: null, direction: 'none', good: null };
  if (prev === null || (prev === 0 && value !== 0)) {
    return { abs: null, pct: null, direction: 'new', good: null };
  }
  const abs = value - prev;
  if (abs === 0) return { abs: 0, pct: 0, direction: 'flat', good: null };
  const pct = (abs / Math.abs(prev)) * 100;
  const up = abs > 0;
  return { abs, pct, direction: up ? 'up' : 'down', good: lowerIsBetter ? !up : up };
}

export function safeDiv(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}

export type Bucket = 'day' | 'week';

/** Day bucket key, or the Monday of its ISO week. */
export function bucketKey(ts: number, bucket: Bucket): string {
  const d = dayKey(ts);
  if (bucket === 'day') return d;
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(d, -((dow + 6) % 7));
}

export function bucketFor(from: number, to: number): Bucket {
  return daysBetween(dayKey(from), dayKey(to)) + 1 > WEEK_BUCKET_AFTER_DAYS ? 'week' : 'day';
}

/** Every bucket key between from and to, with values taken from `counts` (missing → 0). */
export function zeroFillBuckets(from: number, to: number, counts: Map<string, number>) {
  const bucket = bucketFor(from, to);
  const keys: string[] = [];
  const step = bucket === 'day' ? 1 : 7;
  const end = dayKey(to);
  for (let k = bucketKey(from, bucket); k <= end; k = addDays(k, step)) keys.push(k);
  return { bucket, keys, values: keys.map((k) => counts.get(k) ?? 0) };
}
