import {
  COUNTRIES,
  COUNTRY_CODES,
  VEHICLE_SLUGS,
  type AgeBand,
  type Channel,
  type CountryCode,
} from '@leaddesk/shared';
import { getExampleNumber, isValidPhoneNumber } from 'libphonenumber-js';
import mobileExamples from 'libphonenumber-js/mobile/examples';
import { BUDGET_OPTIONS } from '../../lib/budget';
import { defaultValues, type EnquiryFormValues } from '../../lib/payload';

/** F01 FR-033 channel shares (WHATSAPP, CALL, SMS, EMAIL) per age band. */
export const CHANNEL_WEIGHTS: Record<Exclude<AgeBand, 'UNKNOWN'>, Record<Channel, number>> = {
  '18-25': { WHATSAPP: 60, CALL: 10, SMS: 15, EMAIL: 15 },
  '26-35': { WHATSAPP: 50, CALL: 20, SMS: 10, EMAIL: 20 },
  '36-45': { WHATSAPP: 35, CALL: 35, SMS: 5, EMAIL: 25 },
  '46-60': { WHATSAPP: 20, CALL: 50, SMS: 5, EMAIL: 25 },
  '60+': { WHATSAPP: 10, CALL: 60, SMS: 5, EMAIL: 25 },
};

export type BuyerAgeBand = keyof typeof CHANNEL_WEIGHTS;

const AGE_SHARES: [BuyerAgeBand, number][] = [
  ['18-25', 12],
  ['26-35', 28],
  ['36-45', 26],
  ['46-60', 22],
  ['60+', 8],
];

function weighted<T extends string>(entries: [T, number][], roll: number): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let acc = roll * total;
  for (const [k, w] of entries) {
    acc -= w;
    if (acc < 0) return k;
  }
  return entries[entries.length - 1]![0];
}

export function pickAgeBand(roll: number): BuyerAgeBand {
  return weighted(AGE_SHARES, roll);
}

export function pickChannel(band: BuyerAgeBand, roll: number): Channel {
  return weighted(Object.entries(CHANNEL_WEIGHTS[band]) as [Channel, number][], roll);
}

/** Small seedable PRNG (mulberry32) so prefill is reproducible in tests. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FAKER_LOCALE: Partial<Record<CountryCode, string>> = {
  DE: 'de',
  AT: 'de_AT',
  CH: 'de_CH',
  FR: 'fr',
  BE: 'nl_BE',
  NL: 'nl',
  IT: 'it',
  ES: 'es',
  PT: 'pt_PT',
  PL: 'pl',
  IE: 'en_IE',
  DK: 'da',
};

/**
 * A national mobile number the intake API accepts: the country's example mobile number with its
 * last digits randomised, re-checked with libphonenumber (random 9-digit strings were rejected by
 * the server for most countries, so demo enquiries silently never reached the Lead Desk).
 */
export function validMobileDigits(country: CountryCode, rng: () => number): string {
  const example = getExampleNumber(country, mobileExamples);
  const base = example?.nationalNumber ?? '';
  for (let i = 0; i < 25 && base; i++) {
    const tail = String(Math.floor(rng() * 10_000)).padStart(4, '0');
    const candidate = base.slice(0, -4) + tail;
    if (isValidPhoneNumber(candidate, country)) return candidate;
  }
  return base;
}

export interface RandomBuyer {
  values: EnquiryFormValues;
  ageBand: BuyerAgeBand;
}

/** Random, schema-valid buyer. Faker is loaded lazily so it stays out of the main bundle. */
export async function randomBuyer(seed: number = Date.now()): Promise<RandomBuyer> {
  const rng = makeRng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
  const fakerMod = await import('@faker-js/faker');
  const country = pick(COUNTRY_CODES);
  const localized = (fakerMod as unknown as Record<string, typeof fakerMod.faker>)[
    `faker${(FAKER_LOCALE[country] ?? 'en').toUpperCase()}`
  ];
  const faker = localized ?? fakerMod.faker;
  faker.seed(seed);
  const ageBand = pickAgeBand(rng());
  const firstName = faker.person.firstName().slice(0, 60);
  const lastName = faker.person.lastName().slice(0, 60);
  const digits = validMobileDigits(country, rng);
  const values: EnquiryFormValues = {
    ...defaultValues(),
    firstName,
    lastName,
    email: `${firstName}.${lastName}${Math.floor(rng() * 90 + 10)}@example.com`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9.@]/g, ''),
    country,
    dial: COUNTRIES[country].dial,
    phoneDigits: digits,
    city: faker.location.city().slice(0, 80),
    language: COUNTRIES[country].lang,
    preferredChannel: pickChannel(ageBand, rng()),
    bestTime: pick(['MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME'] as const),
    vehicleModel: pick(VEHICLE_SLUGS),
    budget: pick(BUDGET_OPTIONS).value,
    testDriveRequested: rng() < 0.4,
    wantsFinance: rng() < 0.3,
    hasTradeIn: rng() < 0.3,
    message: '',
  };
  return { values, ageBand };
}
