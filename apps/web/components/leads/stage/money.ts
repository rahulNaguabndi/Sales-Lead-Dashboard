import { MAX_DEAL_VALUE_CENTS, formatEUR } from '@leaddesk/shared';

/**
 * Parses a euro amount typed by a user into integer cents. Accepts "36500", "36.500",
 * "36.500,50" and "36500.5"; returns null when empty, non-numeric, <= 0 or above the cap.
 */
export function parseEurToCents(input: string): number | null {
  const s = input.replace(/[\s€]/g, '');
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  let normalized: string;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0) {
    // de-DE: dots group thousands, comma is the decimal separator
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0 && s.length - lastDot - 1 === 3 && s.indexOf('.') === lastDot) {
    normalized = s.replace('.', ''); // "36.500" -> thousands
  } else if (lastDot >= 0 && s.split('.').length > 2) {
    normalized = s.replace(/\./g, ''); // "1.234.567"
  } else {
    normalized = s;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  if (cents <= 0 || cents > MAX_DEAL_VALUE_CENTS) return null;
  return cents;
}

export { formatEUR };
