import {
  COUNTRIES,
  IntakeLeadSchema,
  type BestTime,
  type Channel,
  type CountryCode,
  type IntakeLead,
  type Language,
  type LeadSource,
} from '@leaddesk/shared';
import { budgetRange, type BudgetBand } from './budget';
import { combinePhone } from './phone';

export interface EnquiryFormValues {
  firstName: string;
  lastName: string;
  email: string;
  dial: string;
  phoneDigits: string;
  country: CountryCode;
  city: string;
  language: Language;
  preferredChannel: Channel;
  bestTime: BestTime;
  vehicleModel: string;
  budget: BudgetBand;
  hasTradeIn: boolean;
  wantsFinance: boolean;
  testDriveRequested: boolean;
  message: string;
  marketingConsent: boolean;
  website: string;
}

export function defaultValues(): EnquiryFormValues {
  return {
    firstName: '',
    lastName: '',
    email: '',
    dial: COUNTRIES.DE.dial,
    phoneDigits: '',
    country: 'DE',
    city: '',
    language: 'de',
    preferredChannel: 'WHATSAPP',
    bestTime: 'ANYTIME',
    vehicleModel: '',
    budget: '',
    hasTradeIn: false,
    wantsFinance: false,
    testDriveRequested: false,
    message: '',
    marketingConsent: false,
    website: '',
  };
}

export interface SourceSelection {
  source: LeadSource;
  sourceDetail?: string;
}

export function buildPayload(v: EnquiryFormValues, src?: SourceSelection): IntakeLead {
  const trim = (s: string) => s.trim() || undefined;
  const out: Record<string, unknown> = {
    firstName: v.firstName.trim(),
    lastName: v.lastName.trim(),
    email: trim(v.email),
    phone: combinePhone(v.dial, v.phoneDigits),
    country: v.country,
    city: trim(v.city),
    ageBand: 'UNKNOWN',
    language: v.language,
    preferredChannel: v.preferredChannel,
    bestTime: v.bestTime,
    vehicleModel: trim(v.vehicleModel),
    ...budgetRange(v.budget),
    hasTradeIn: v.hasTradeIn,
    wantsFinance: v.wantsFinance,
    testDriveRequested: v.testDriveRequested,
    message: trim(v.message),
    source: src?.source ?? 'WEBSITE',
    sourceDetail: src?.sourceDetail,
    marketingConsent: v.marketingConsent,
    website: trim(v.website),
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as IntakeLead;
}

export const CONTACT_REQUIRED = 'Please give us an email or phone number.';

/** Map an API/schema path to the form field it is shown next to. */
export function fieldForPath(path: string, channel?: Channel): string {
  if (path === 'phone') return 'phoneDigits';
  if (path === 'budgetMin' || path === 'budgetMax') return 'budget';
  if (path === 'preferredChannel') return channel === 'EMAIL' ? 'email' : 'phoneDigits';
  return path;
}

export type Validation =
  | { ok: true; payload: IntakeLead }
  | { ok: false; errors: Record<string, string> };

export function validateEnquiry(v: EnquiryFormValues, src?: SourceSelection): Validation {
  const raw = buildPayload(v, src);
  const r = IntakeLeadSchema.safeParse(raw);
  if (r.success) return { ok: true, payload: raw };
  const errors: Record<string, string> = {};
  const hasContact = !!(raw.email || raw.phone);
  for (const issue of r.error.issues) {
    const p = String(issue.path[0] ?? 'form');
    let msg = issue.message;
    if (p === 'email' && msg === 'Email or phone is required') msg = CONTACT_REQUIRED;
    else if (p === 'preferredChannel') {
      if (!hasContact) continue;
      msg =
        v.preferredChannel === 'EMAIL'
          ? 'Email is needed so we can contact you there.'
          : 'A phone number is needed for this contact method.';
    } else if (p === 'email') msg = 'Please enter a valid email address.';
    else if (p === 'phone') msg = 'Please enter a valid phone number.';
    else if (issue.code === 'too_small' || issue.code === 'invalid_string')
      msg = 'Please check this field.';
    errors[fieldForPath(p, v.preferredChannel)] ??= msg;
  }
  return { ok: false, errors };
}
