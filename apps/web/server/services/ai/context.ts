import type { Channel, Priority, Stage } from '@leaddesk/shared';
import type { ActivityItem, LeadDetail } from '@/components/leads/detail/types';
import type { LeadOfferDTO } from '@/server/services/offer-matcher';

const REDACTED = '[redacted]';
const MAX_ACTIVITIES = 15;
const MAX_NOTE = 300;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;
// International numbers (+49 / +33 / +39 and any other +CC) and long digit runs.
const PHONE_RE = /(?:\+|00)\d[\d\s().-]{6,}\d/g;
const LONG_DIGITS_RE = /\b\d{9,}\b/g;

/** Removes emails, phone numbers and IBANs, plus any extra known-sensitive strings. */
export function scrubPII(text: string, known: readonly string[] = []): string {
  let out = text.replace(EMAIL_RE, REDACTED).replace(IBAN_RE, REDACTED);
  out = out.replace(PHONE_RE, REDACTED).replace(LONG_DIGITS_RE, REDACTED);
  for (const k of known) {
    const v = k.trim();
    if (v.length < 3) continue;
    out = out.replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), REDACTED);
  }
  return out;
}

export type AiActivity = {
  type: string;
  outcome: string | null;
  note: string;
  byRep: boolean;
  system: boolean;
  aiAssisted: boolean;
  at: number;
};

export type AiOffer = { id: string; title: string; description: string; reasons: string[] };

/** What the model (and the rules) may know about a lead. Never holds email, phone or surname. */
export type LeadAiContext = {
  firstName: string;
  repFirstName: string;
  ageBand: string;
  city: string | null;
  country: string;
  language: string;
  isReturning: boolean;
  preferredChannel: Channel;
  secondaryChannel: Channel | null;
  bestTime: string;
  vehicle: string | null;
  budgetBand: string | null;
  hasTradeIn: boolean;
  wantsFinance: boolean;
  testDriveRequested: boolean;
  message: string | null;
  source: string;
  stage: Stage;
  priority: Priority;
  score: number;
  previousLeads: number;
  purchases: number;
  activities: AiActivity[];
  offers: AiOffer[];
  now: number;
  createdAt: number;
  /** Only these feed the fingerprint; they are not sent to the model. */
  meta: { leadId: string; version: number; lastActivityAt: number | null };
};

/** Budget as a rounded band (nearest €5k) so exact figures never leave the server. */
export function budgetBand(minCents: number | null, maxCents: number | null): string | null {
  const vals = [minCents, maxCents].filter((v): v is number => v != null && v > 0);
  if (!vals.length) return null;
  const mid = vals.reduce((a, b) => a + b, 0) / vals.length / 100;
  const rounded = Math.max(5000, Math.round(mid / 5000) * 5000);
  return `~€${rounded.toLocaleString('en-US')}`;
}

export type ContextInput = {
  detail: LeadDetail;
  activities: ActivityItem[];
  offers: LeadOfferDTO[];
  repName: string;
  now?: number;
};

export function buildLeadContext(input: ContextInput): LeadAiContext {
  const { detail, offers } = input;
  const { lead, customer } = detail;
  const known = [customer.lastName, customer.email ?? '', customer.phone ?? ''];
  const clean = (t: string | null | undefined, max = MAX_NOTE) =>
    scrubPII(t ?? '', known).slice(0, max);

  const recent = [...input.activities]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ACTIVITIES)
    .reverse();

  return {
    firstName: customer.firstName,
    repFirstName: input.repName.split(' ')[0] ?? input.repName,
    ageBand: customer.ageBand,
    city: customer.city,
    country: customer.country,
    language: customer.language,
    isReturning: customer.isReturning,
    preferredChannel: customer.preferredChannel,
    secondaryChannel: customer.secondaryChannel,
    bestTime: customer.bestTime,
    vehicle: lead.vehicleName,
    budgetBand: budgetBand(lead.budgetMin, lead.budgetMax),
    hasTradeIn: lead.hasTradeIn,
    wantsFinance: lead.wantsFinance,
    testDriveRequested: lead.testDriveRequested,
    message: lead.message ? clean(lead.message) : null,
    source: lead.source,
    stage: lead.stage,
    priority: lead.priority,
    score: lead.score,
    previousLeads: detail.history.previousLeads.length,
    purchases: detail.history.purchases.length,
    activities: recent.map((a) => ({
      type: a.type,
      outcome: a.outcome,
      note: clean(a.note),
      byRep: a.kind === 'USER',
      system: a.kind === 'SYSTEM',
      aiAssisted: a.aiAssisted,
      at: a.createdAt,
    })),
    offers: offers.map((o) => ({
      id: o.offer.id,
      title: clean(o.offer.title, 120),
      description: clean(o.offer.description, 200),
      reasons: o.reasons.map((r) => clean(r, 120)),
    })),
    now: input.now ?? Date.now(),
    createdAt: lead.createdAt,
    meta: { leadId: lead.id, version: lead.version, lastActivityAt: lead.lastActivityAt },
  };
}

export const CONTACT_TYPES = ['CALL', 'WHATSAPP', 'SMS', 'EMAIL'] as const;

/** Rep-initiated contact attempts (calls, messages), oldest first. */
export function contactActivities(ctx: LeadAiContext): AiActivity[] {
  return ctx.activities.filter(
    (a) => a.byRep && (CONTACT_TYPES as readonly string[]).includes(a.type),
  );
}
