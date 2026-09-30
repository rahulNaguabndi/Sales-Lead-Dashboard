import { formatEUR } from '@leaddesk/shared';

export { formatEUR };

/** "up to 40.000 €", "25.000 € – 40.000 €", "from 25.000 €" or "Not specified". */
export function formatBudget(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'Not specified';
  if (min != null && max != null) return `${formatEUR(min)} – ${formatEUR(max)}`;
  if (max != null) return `up to ${formatEUR(max)}`;
  return `from ${formatEUR(min!)}`;
}

/** International display: keeps a leading "+", groups digits loosely. Returns "—" when absent. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const trimmed = phone.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '—';
  if (!plus) return digits;
  const cc = digits.slice(0, 2);
  const rest = digits.slice(2).replace(/(\d{3})(?=\d)/g, '$1 ');
  return `+${cc} ${rest}`.trim();
}
