import { z } from 'zod';
import { VEHICLES } from './catalog';
import { DISCOUNT_TYPES, LEAD_SOURCES, type DiscountType } from './enums';
import { formatEUR } from './format';

const DAY_MS = 86_400_000;
export const ENDS_SOON_MS = 7 * DAY_MS;
const BRUSSELS = 'Europe/Brussels';

/** Declarative, AND-combined eligibility rules. Strict: unknown keys are rejected. */
export const OfferEligibilitySchema = z
  .object({
    customerType: z.enum(['ANY', 'NEW', 'RETURNING']).optional(),
    models: z.array(z.string().min(1)).min(1).optional(),
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .min(1)
      .optional(),
    requiresTradeIn: z.literal(true).optional(),
    requiresFinance: z.literal(true).optional(),
    minBudget: z.number().int().positive().optional(),
    sources: z.array(z.enum(LEAD_SOURCES)).min(1).optional(),
  })
  .strict();
export type OfferEligibilityRules = z.infer<typeof OfferEligibilitySchema>;

const OfferBaseSchema = z
  .object({
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(300).default(''),
    discountType: z.enum(DISCOUNT_TYPES),
    value: z.number().int().nullable().optional(),
    validFrom: z.number().int(),
    validTo: z.number().int(),
    eligibility: OfferEligibilitySchema.default({}),
    isActive: z.boolean().default(true),
  })
  .strict();

/** Body of POST /api/offers. */
export const OfferInputSchema = OfferBaseSchema.superRefine((o, ctx) => {
  checkValue(o.discountType, o.value ?? null, (message) =>
    ctx.addIssue({ code: 'custom', path: ['value'], message }),
  );
  if (o.validTo < o.validFrom)
    ctx.addIssue({ code: 'custom', path: ['validTo'], message: 'Must not be before start' });
});
export type OfferInput = z.infer<typeof OfferInputSchema>;

/** Body of PATCH /api/offers/:id: any subset of fields; the merged offer is re-validated by the service. */
export const OfferPatchSchema = OfferBaseSchema.partial().refine((o) => Object.keys(o).length > 0, {
  message: 'Provide at least one field',
});
export type OfferPatchInput = z.infer<typeof OfferPatchSchema>;

/** Shared value rule, also reused by PATCH validation of the merged offer. */
export function checkValue(
  type: DiscountType,
  value: number | null,
  fail: (message: string) => void,
): void {
  if (type === 'GIFT') return;
  if (value === null) return fail('Value is required');
  if (type === 'AMOUNT' && value <= 0) fail('Must be greater than 0');
  if (type === 'PERCENT' && (value < 1 || value > 100)) fail('Must be between 1 and 100');
  if (type === 'APR' && (value < 0 || value > 2000)) fail('Must be between 0 and 2000 bps');
}

export type MatchableOffer = {
  id: string;
  title: string;
  description: string;
  discountType: DiscountType;
  value: number | null;
  validFrom: number;
  validTo: number;
  eligibility: unknown;
  isActive: boolean;
};

export type OfferStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'INACTIVE';

export function isOfferActive(
  o: Pick<MatchableOffer, 'isActive' | 'validFrom' | 'validTo'>,
  now: number,
): boolean {
  return o.isActive && o.validFrom <= now && now <= o.validTo;
}

export function offerStatus(
  o: Pick<MatchableOffer, 'isActive' | 'validFrom' | 'validTo'>,
  now: number,
): OfferStatus {
  if (!o.isActive) return 'INACTIVE';
  if (now < o.validFrom) return 'SCHEDULED';
  if (now > o.validTo) return 'EXPIRED';
  return 'ACTIVE';
}

// Percentages match the dashboards ("12.5%"): English decimals, no space before the sign.
const nf = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

/** "1.500 €", "5%", "0.9% APR" or the gift description. */
export function formatOfferValue(
  o: Pick<MatchableOffer, 'discountType' | 'value' | 'description'>,
): string {
  if (o.discountType === 'GIFT') return o.description;
  if (o.value === null) return '';
  if (o.discountType === 'AMOUNT') return formatEUR(o.value);
  if (o.discountType === 'PERCENT') return `${nf.format(o.value)}%`;
  return `${nf.format(o.value / 100)}% APR`;
}

function brusselsOffsetMs(instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BRUSSELS,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

function brusselsLocalToUtc(dateStr: string, h: number, m: number, s: number, ms: number): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new Error(`Invalid date: ${dateStr}`);
  const guess = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), h, m, s, ms);
  return guess - brusselsOffsetMs(guess);
}

/** 23:59:59.999 Europe/Brussels on the given YYYY-MM-DD, as UTC ms. */
export function endOfDayBrussels(dateStr: string): number {
  return brusselsLocalToUtc(dateStr, 23, 59, 59, 999);
}

/** 00:00:00.000 Europe/Brussels on the given YYYY-MM-DD, as UTC ms. */
export function startOfDayBrussels(dateStr: string): number {
  return brusselsLocalToUtc(dateStr, 0, 0, 0, 0);
}

export type OfferLeadContext = {
  isReturning: boolean;
  country: string;
  model: string | null;
  hasTradeIn: boolean;
  wantsFinance: boolean;
  /** Upper budget in cents when known. */
  budget: number | null;
  source: string;
};

export type OfferMatch<O extends MatchableOffer = MatchableOffer> = {
  offer: O;
  reasons: string[];
  endsSoon: boolean;
};

const modelName = (slug: string) => VEHICLES.find((v) => v.slug === slug)?.name ?? slug;

/** Returns human reasons when the lead satisfies every rule, otherwise null. */
function evaluate(rules: OfferEligibilityRules, lead: OfferLeadContext): string[] | null {
  const reasons: string[] = [];
  if (rules.customerType === 'RETURNING') {
    if (!lead.isReturning) return null;
    reasons.push('Returning customer');
  } else if (rules.customerType === 'NEW') {
    if (lead.isReturning) return null;
    reasons.push('New customer');
  }
  if (rules.models) {
    if (!lead.model || !rules.models.includes(lead.model)) return null;
    reasons.push(`Interested in ${modelName(lead.model)}`);
  }
  if (rules.countries) {
    if (!rules.countries.includes(lead.country)) return null;
    reasons.push(`Customer in ${lead.country}`);
  }
  if (rules.requiresTradeIn) {
    if (!lead.hasTradeIn) return null;
    reasons.push('Has a trade-in');
  }
  if (rules.requiresFinance) {
    if (!lead.wantsFinance) return null;
    reasons.push('Wants finance');
  }
  if (rules.minBudget !== undefined) {
    if (lead.budget === null || lead.budget < rules.minBudget) return null;
    reasons.push(`Budget of at least ${formatEUR(rules.minBudget)}`);
  }
  if (rules.sources) {
    if (!rules.sources.includes(lead.source as never)) return null;
    reasons.push(`Source: ${lead.source}`);
  }
  return reasons.length ? reasons : ['Available to all customers'];
}

/** Explains why one lead is eligible for one offer; null when ineligible or unparseable. */
export function matchOffer<O extends MatchableOffer>(
  offer: O,
  lead: OfferLeadContext,
  now: number,
): OfferMatch<O> | null {
  if (!isOfferActive(offer, now)) return null;
  const parsed = OfferEligibilitySchema.safeParse(offer.eligibility);
  if (!parsed.success) {
    // Fail closed; ids only, no PII.
    console.warn(`[offers] offer ${offer.id} has unparseable eligibility; treated as not matching`);
    return null;
  }
  const reasons = evaluate(parsed.data, lead);
  if (!reasons) return null;
  return { offer, reasons, endsSoon: offer.validTo - now <= ENDS_SOON_MS };
}

const sortValue = (o: MatchableOffer) => (o.discountType === 'AMOUNT' ? (o.value ?? 0) : 0);

/** Active offers the lead is eligible for: validTo asc, AMOUNT value desc, title asc. */
export function matchOffers<O extends MatchableOffer>(
  offers: O[],
  lead: OfferLeadContext,
  now: number,
): OfferMatch<O>[] {
  const out: OfferMatch<O>[] = [];
  for (const o of offers) {
    const m = matchOffer(o, lead, now);
    if (m) out.push(m);
  }
  return out.sort(
    (a, b) =>
      a.offer.validTo - b.offer.validTo ||
      sortValue(b.offer) - sortValue(a.offer) ||
      a.offer.title.localeCompare(b.offer.title),
  );
}
