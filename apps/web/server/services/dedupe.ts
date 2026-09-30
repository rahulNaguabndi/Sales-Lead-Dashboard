import { eq, max } from 'drizzle-orm';
import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile';
import {
  buildCustomerSearchText,
  type AgeBand,
  type Channel,
  type CountryCode,
} from '@leaddesk/shared';
import type { Db, Tx } from '../db/client';
import { customers, leads, purchases } from '../db/schema';

export type Conn = Db | Tx;

const FIVE_YEARS_MS = 5 * 365 * 24 * 3_600_000;

export type CustomerFacts = {
  isReturning: boolean;
  hasRecentPurchase: boolean;
  lastPurchaseAt: number | null;
};

/** E.164 for a phone typed in national or international format; null when it is not a valid number. */
export function normalizePhone(raw: string, country: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), country);
  return parsed?.isValid() ? parsed.number : null;
}

/** True when the preferred channel needs a mobile number but the number is not one. */
export function nonMobileChannelWarning(e164: string | null, channel: Channel): boolean {
  if (!e164 || (channel !== 'WHATSAPP' && channel !== 'SMS')) return false;
  const type = parsePhoneNumberFromString(e164)?.getType();
  return type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE';
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function deriveAgeBand(age: number | null | undefined): AgeBand {
  if (age == null) return 'UNKNOWN';
  if (age <= 25) return '18-25';
  if (age <= 35) return '26-35';
  if (age <= 45) return '36-45';
  if (age <= 60) return '46-60';
  return '60+';
}

export type CustomerMatch = {
  customer: typeof customers.$inferSelect;
  /** Set when phone and email identify two different customers (phone wins). */
  emailConflictId: string | null;
};

/** Matches by E.164 phone first, then by lowercase email. */
export function findCustomer(
  conn: Conn,
  phone: string | null,
  email: string | null,
): CustomerMatch | null {
  const byPhone = phone
    ? conn.select().from(customers).where(eq(customers.phone, phone)).limit(1).get()
    : undefined;
  const byEmail = email
    ? conn.select().from(customers).where(eq(customers.email, email)).limit(1).get()
    : undefined;
  if (byPhone) {
    return {
      customer: byPhone,
      emailConflictId: byEmail && byEmail.id !== byPhone.id ? byEmail.id : null,
    };
  }
  return byEmail ? { customer: byEmail, emailConflictId: null } : null;
}

export function customerFacts(conn: Conn, customerId: string, now: number): CustomerFacts {
  const purchase = conn
    .select({ at: max(purchases.purchasedAt) })
    .from(purchases)
    .where(eq(purchases.customerId, customerId))
    .get();
  const lastPurchaseAt = purchase?.at ?? null;
  const earlierLead = conn
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.customerId, customerId))
    .limit(1)
    .get();
  return {
    isReturning: !!earlierLead || lastPurchaseAt !== null,
    hasRecentPurchase: lastPurchaseAt !== null && now - lastPurchaseAt <= FIVE_YEARS_MS,
    lastPurchaseAt,
  };
}

export type CustomerPrefs = {
  phone: string | null;
  email: string | null;
  city?: string;
  ageBand: AgeBand;
  age?: number;
  language: string;
  preferredChannel: Channel;
  secondaryChannel?: Channel;
  bestTime: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANYTIME';
  marketingConsent: boolean;
};

/** Updates preferences and fills missing contact details. Never overwrites the name. */
export function mergeCustomer(
  tx: Tx,
  existing: typeof customers.$inferSelect,
  prefs: CustomerPrefs,
  markReturning: boolean,
): void {
  const email = existing.email ?? prefs.email;
  const phone = existing.phone ?? prefs.phone;
  tx.update(customers)
    .set({
      email,
      phone,
      city: prefs.city ?? existing.city,
      age: prefs.age ?? existing.age,
      ageBand: prefs.ageBand !== 'UNKNOWN' ? prefs.ageBand : existing.ageBand,
      language: prefs.language,
      preferredChannel: prefs.preferredChannel,
      secondaryChannel: prefs.secondaryChannel ?? existing.secondaryChannel,
      bestTime: prefs.bestTime,
      marketingConsent: existing.marketingConsent || prefs.marketingConsent,
      isReturning: existing.isReturning || markReturning,
      searchText: buildCustomerSearchText({
        firstName: existing.firstName,
        lastName: existing.lastName,
        email,
        phone,
      }),
    })
    .where(eq(customers.id, existing.id))
    .run();
}
