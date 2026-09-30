import {
  fakerDE,
  fakerEN,
  fakerES,
  fakerFR,
  fakerIT,
  fakerNL,
  fakerPT_PT,
  type Faker,
} from '@faker-js/faker';
import {
  COUNTRIES,
  VEHICLES,
  buildCustomerSearchText,
  stripDiacritics,
  type AgeBand,
  type Channel,
  type CountryCode,
} from '@leaddesk/shared';
import { rng } from './utils/rng';
import { clock, DAY } from './utils/time';
import { newId } from './utils/ids';
import type { CustomerRow, PurchaseRow } from './types';

const LOCALES: Record<string, Faker> = {
  DE: fakerDE,
  AT: fakerDE,
  CH: fakerDE,
  FR: fakerFR,
  LU: fakerFR,
  BE: fakerNL,
  NL: fakerNL,
  IT: fakerIT,
  ES: fakerES,
  PT: fakerPT_PT,
};

export function seedFaker(seed: number): void {
  for (const f of new Set([fakerDE, fakerEN, fakerES, fakerFR, fakerIT, fakerNL, fakerPT_PT])) {
    f.seed(seed);
  }
}

const COUNTRY_WEIGHTS: [CountryCode, number][] = [
  ['DE', 24],
  ['AT', 7],
  ['CH', 6],
  ['FR', 16],
  ['BE', 7],
  ['NL', 9],
  ['LU', 2],
  ['IT', 13],
  ['ES', 10],
  ['PT', 4],
  ['PL', 0.7],
  ['IE', 0.7],
  ['DK', 0.6],
];

const AGE_BAND_SHARES: [AgeBand, number][] = [
  ['18-25', 12],
  ['26-35', 28],
  ['36-45', 26],
  ['46-60', 22],
  ['60+', 8],
  ['UNKNOWN', 4],
];

// Channel preference by age band (FR-033): WHATSAPP, CALL, SMS, EMAIL.
const CHANNEL_WEIGHTS: Record<AgeBand, number[]> = {
  '18-25': [60, 10, 15, 15],
  '26-35': [50, 20, 10, 20],
  '36-45': [35, 35, 5, 25],
  '46-60': [20, 50, 5, 25],
  '60+': [10, 60, 5, 25],
  UNKNOWN: [30, 30, 10, 30],
};
const CHANNEL_ORDER: Channel[] = ['WHATSAPP', 'CALL', 'SMS', 'EMAIL'];

const AGE_RANGE: Record<Exclude<AgeBand, 'UNKNOWN'>, [number, number]> = {
  '18-25': [18, 25],
  '26-35': [26, 35],
  '36-45': [36, 45],
  '46-60': [46, 60],
  '60+': [61, 85],
};

const EMAIL_DOMAINS = [
  'gmail.com',
  'outlook.com',
  'gmx.net',
  'web.de',
  'orange.fr',
  'libero.it',
  'proton.me',
];

export type CustomersResult = {
  customers: CustomerRow[];
  purchases: PurchaseRow[];
  returningIds: Set<string>;
};

function slug(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function seedCustomers(count = 600): CustomersResult {
  const now = clock.now;
  const customers: CustomerRow[] = [];
  const purchases: PurchaseRow[] = [];
  const returningIds = new Set<string>();
  const emails = new Set<string>();
  const phones = new Set<string>();

  for (let i = 0; i < count; i++) {
    const country = rng.weightedPick(
      COUNTRY_WEIGHTS.map(([c]) => c),
      COUNTRY_WEIGHTS.map(([, w]) => w),
    );
    const faker = LOCALES[country] ?? fakerEN;
    const meta = COUNTRIES[country];
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const ageBand = rng.weightedPick(
      AGE_BAND_SHARES.map(([b]) => b),
      AGE_BAND_SHARES.map(([, s]) => s),
    );
    const age = ageBand === 'UNKNOWN' ? null : rng.int(...AGE_RANGE[ageBand]);
    const preferredChannel = rng.weightedPick(CHANNEL_ORDER, CHANNEL_WEIGHTS[ageBand]);

    // Email and phone: at least one is present, and the preferred channel's detail always exists.
    let hasEmail = rng.chance(0.88);
    let hasPhone = rng.chance(0.92);
    if (!hasEmail && !hasPhone) hasPhone = true;
    if (preferredChannel === 'EMAIL') hasEmail = true;
    else hasPhone = true;

    let email: string | null = null;
    if (hasEmail) {
      let base = `${slug(firstName)}.${slug(lastName)}`;
      email = `${base}@${rng.pick(EMAIL_DOMAINS)}`;
      while (emails.has(email)) {
        base = `${slug(firstName)}.${slug(lastName)}${rng.int(2, 99)}`;
        email = `${base}@${rng.pick(EMAIL_DOMAINS)}`;
      }
      emails.add(email);
    }
    let phone: string | null = null;
    if (hasPhone) {
      do {
        phone = `${meta.dial}${rng.int(1, 9)}${String(rng.int(0, 99_999_999)).padStart(8, '0')}`;
      } while (phones.has(phone));
      phones.add(phone);
    }

    const id = newId(now - rng.int(1, 90) * DAY);
    const customer: CustomerRow = {
      id,
      firstName,
      lastName,
      email,
      phone,
      country,
      city: faker.location.city(),
      age,
      ageBand,
      language: meta.lang,
      preferredChannel,
      secondaryChannel: rng.chance(0.5)
        ? rng.pick(CHANNEL_ORDER.filter((c) => c !== preferredChannel))
        : null,
      bestTime: rng.weightedPick(
        ['MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME'] as const,
        [25, 25, 30, 20],
      ),
      isReturning: false,
      marketingConsent: rng.chance(0.4),
      searchText: buildCustomerSearchText({ firstName, lastName, email, phone }),
      createdAt: now, // replaced once the customer's leads are known
    };

    if (rng.chance(0.2)) {
      customer.isReturning = true;
      returningIds.add(id);
      const n = rng.int(1, 2);
      for (let p = 0; p < n; p++) {
        const vehicle = rng.pick(VEHICLES);
        const purchasedAt = now - rng.int(365, 8 * 365) * DAY;
        purchases.push({
          id: newId(purchasedAt),
          customerId: id,
          leadId: null,
          vehicleModel: vehicle.slug,
          amount: Math.round((vehicle.priceCents * rng.float(0.9, 1.1)) / 100) * 100,
          purchasedAt,
        });
      }
    }
    customers.push(customer);
  }
  return { customers, purchases, returningIds };
}

/** The two demo "hero" customers used by the guided demo (FR-037). */
export function seedHeroCustomers(): {
  giulia: CustomerRow;
  markus: CustomerRow;
  purchase: PurchaseRow;
} {
  const now = clock.now;
  const make = (
    c: Omit<CustomerRow, 'id' | 'searchText' | 'createdAt' | 'isReturning'> & {
      isReturning?: boolean;
    },
  ) => {
    const customer: CustomerRow = {
      ...c,
      id: newId(now - 30 * DAY),
      isReturning: c.isReturning ?? false,
      searchText: buildCustomerSearchText({
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
      }),
      createdAt: now,
    };
    return customer;
  };
  const giulia = make({
    firstName: 'Giulia',
    lastName: 'Conti',
    email: 'giulia.conti@libero.it',
    phone: '+393351234567',
    country: 'IT',
    city: 'Milano',
    age: 34,
    ageBand: '26-35',
    language: 'it',
    preferredChannel: 'WHATSAPP',
    secondaryChannel: 'CALL',
    bestTime: 'EVENING',
    marketingConsent: true,
  });
  const markus = make({
    firstName: 'Markus',
    lastName: 'Klein',
    email: 'markus.klein@web.de',
    phone: '+4917612345678',
    country: 'DE',
    city: 'München',
    age: 52,
    ageBand: '46-60',
    language: 'de',
    preferredChannel: 'CALL',
    secondaryChannel: 'EMAIL',
    bestTime: 'MORNING',
    marketingConsent: true,
    isReturning: true,
  });
  const purchasedAt = Date.UTC(2021, 2, 15, 10, 30);
  const purchase: PurchaseRow = {
    id: newId(purchasedAt),
    customerId: markus.id,
    leadId: null,
    vehicleModel: 'vento-sedan',
    amount: 3_150_000,
    purchasedAt,
  };
  return { giulia, markus, purchase };
}
