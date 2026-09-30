import { rng } from './rng';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Single reference point for every timestamp in a seed run (FR-030). It is truncated to the hour
 * so two resets within the same hour produce byte-identical data.
 */
export const defaultNow = () => Math.floor(Date.now() / HOUR) * HOUR;
export const clock = { now: defaultNow() };

export function setNow(ms: number): void {
  clock.now = ms;
}

export function daysAgo(n: number, jitterHours = 0): number {
  return clock.now - n * DAY - (jitterHours ? rng.float(0, jitterHours) * HOUR : 0);
}

const WORK_START_H = 8;
const WORK_END_H = 20;

/** Moves a timestamp into the 08:00-20:00 (UTC) window, rolling to the next morning if needed. */
export function workingHoursOffset(baseMs: number, minutesOffset = 0): number {
  const ms = baseMs + minutesOffset * MINUTE;
  const d = new Date(ms);
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
  if (hour >= WORK_START_H && hour < WORK_END_H) return ms;
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const nextDay = hour >= WORK_END_H ? DAY : 0;
  // Jitter is derived from the timestamp, not the shared rng: the number of rng draws must not
  // depend on the wall-clock time of day, or two seeds run hours apart would diverge.
  const jitter = (Math.imul(Math.floor(ms / MINUTE), 2654435761) >>> 0) % 121;
  return dayStart + nextDay + WORK_START_H * HOUR + jitter * MINUTE;
}

/** A random time after afterMs that falls inside working hours. */
export function randomWorkingTime(afterMs: number): number {
  return workingHoursOffset(afterMs + rng.int(5, 600) * MINUTE);
}

/**
 * Working-hours clamp that never produces a timestamp in the future: very recent activity on a
 * night-time seed run keeps its raw time instead.
 */
export function workTime(ms: number): number {
  const shifted = workingHoursOffset(ms);
  return shifted > clock.now ? Math.min(ms, clock.now) : shifted;
}
