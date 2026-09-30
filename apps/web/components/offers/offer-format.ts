import { formatEUR, type OfferEligibilityRules } from '@leaddesk/shared';
import type { OfferDTO } from '@/server/services/offer-matcher';

const until = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Brussels',
});
const full = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Brussels',
});

/** "31 Dec" (valid_to is end of day Brussels, so format in that zone). */
export const formatUntil = (ms: number): string => until.format(new Date(ms));
export const formatDay = (ms: number): string => full.format(new Date(ms));

/** YYYY-MM-DD in Brussels for a date input. */
export function toDateInput(ms: number): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
  return p;
}

export const STATUS_LABEL: Record<OfferDTO['status'], string> = {
  ACTIVE: 'Active',
  SCHEDULED: 'Scheduled',
  EXPIRED: 'Expired',
  INACTIVE: 'Inactive',
};

export const STATUS_STYLE: Record<OfferDTO['status'], string> = {
  ACTIVE: 'bg-green-500/15 text-green-400',
  SCHEDULED: 'bg-blue-500/15 text-blue-300',
  EXPIRED: 'bg-slate-500/15 text-slate-400',
  INACTIVE: 'bg-amber-500/15 text-amber-400',
};

/** One-line plain-language summary of the eligibility rules for the table. */
export function summarizeEligibility(rules: OfferEligibilityRules): string {
  const parts: string[] = [];
  if (rules.customerType === 'RETURNING') parts.push('Returning customers');
  if (rules.customerType === 'NEW') parts.push('New customers');
  if (rules.models?.length) parts.push(`Models: ${rules.models.join(', ')}`);
  if (rules.countries?.length) parts.push(`Countries: ${rules.countries.join(', ')}`);
  if (rules.requiresTradeIn) parts.push('With trade-in');
  if (rules.requiresFinance) parts.push('With finance');
  if (rules.minBudget) parts.push(`Budget from ${formatEUR(rules.minBudget)}`);
  if (rules.sources?.length) parts.push(`Sources: ${rules.sources.join(', ')}`);
  return parts.length ? parts.join(' · ') : 'All leads';
}
