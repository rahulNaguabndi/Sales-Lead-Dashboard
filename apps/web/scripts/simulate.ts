/**
 * Lead traffic simulator (F10 FR-021). A pure HTTP client of POST /api/intake/leads.
 *   npm run simulate -- --count 20 --rate 12 --seed 1
 */
import { parseArgs } from 'node:util';
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
import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile';
import {
  COUNTRIES,
  COUNTRY_CODES,
  VEHICLE_SLUGS,
  vehiclePrice,
  type CountryCode,
  type LeadSource,
} from '@leaddesk/shared';
import { seedCustomers, seedFaker } from '../server/db/seed/customers';
import { resetIds } from '../server/db/seed/utils/ids';
import { rng as seedRng, SeededRng } from '../server/db/seed/utils/rng';
import { resetReferences } from '../server/db/seed/utils/reference';
import { defaultNow, setNow } from '../server/db/seed/utils/time';

export const SOURCE_WEIGHTS: [LeadSource, number][] = [
  ['WEBSITE', 35],
  ['FACEBOOK', 12],
  ['INSTAGRAM', 8],
  ['GOOGLE_ADS', 15],
  ['PORTAL', 5],
  ['WALK_IN', 10],
  ['PHONE', 8],
  ['REFERRAL', 7],
];

export type SimOptions = {
  url: string;
  key: string;
  rate: number;
  count: number;
  seed: number;
  returning: number;
  countries: CountryCode[];
  burst: boolean;
  failFast: boolean;
};

export function parseSimArgs(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
): SimOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      url: { type: 'string' },
      key: { type: 'string' },
      rate: { type: 'string' },
      count: { type: 'string' },
      seed: { type: 'string' },
      returning: { type: 'string' },
      countries: { type: 'string' },
      burst: { type: 'boolean' },
      'fail-fast': { type: 'boolean' },
    },
  });
  const num = (v: string | undefined, d: number, name: string) => {
    if (v === undefined) return d;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`--${name} must be a number`);
    return n;
  };
  const returning = num(values.returning, 0.15, 'returning');
  if (returning < 0 || returning > 1) throw new Error('--returning must be between 0 and 1');
  const rate = num(values.rate, 12, 'rate');
  if (rate <= 0) throw new Error('--rate must be positive');
  const countries = values.countries
    ? (values.countries.split(',').map((c) => c.trim().toUpperCase()) as CountryCode[])
    : [...COUNTRY_CODES];
  for (const c of countries) {
    if (!COUNTRY_CODES.includes(c)) throw new Error(`Unknown country: ${c}`);
  }
  return {
    url: values.url ?? 'http://localhost:3000/api/intake/leads',
    key: values.key ?? env.INTAKE_API_KEY ?? 'showroom-dev-key',
    rate,
    count: num(values.count, 20, 'count'),
    seed: values.seed !== undefined ? num(values.seed, 0, 'seed') : Math.floor(Math.random() * 1e9),
    returning,
    countries,
    burst: !!values.burst,
    failFast: !!values['fail-fast'],
  };
}

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

// Mobile number shapes per country: [national prefix, digits that follow].
const MOBILE: Record<CountryCode, [string, number]> = {
  DE: ['151', 8],
  AT: ['664', 7],
  CH: ['79', 7],
  FR: ['6', 8],
  BE: ['470', 6],
  NL: ['6', 8],
  LU: ['621', 6],
  IT: ['347', 7],
  ES: ['6', 8],
  PT: ['91', 7],
  PL: ['512', 6],
  IE: ['85', 7],
  DK: ['20', 6],
};

const CITIES: Record<CountryCode, string[]> = {
  DE: ['Hamburg', 'Berlin', 'Munich', 'Cologne'],
  AT: ['Vienna', 'Graz', 'Salzburg'],
  CH: ['Zurich', 'Bern', 'Basel'],
  FR: ['Paris', 'Lyon', 'Lille', 'Marseille'],
  BE: ['Brussels', 'Antwerp', 'Ghent'],
  NL: ['Amsterdam', 'Rotterdam', 'Utrecht'],
  LU: ['Luxembourg'],
  IT: ['Milan', 'Rome', 'Turin', 'Naples'],
  ES: ['Madrid', 'Barcelona', 'Valencia'],
  PT: ['Lisbon', 'Porto'],
  PL: ['Warsaw', 'Krakow'],
  IE: ['Dublin', 'Cork'],
  DK: ['Copenhagen', 'Aarhus'],
};

export type SimPayload = Record<string, unknown> & {
  firstName: string;
  lastName: string;
  country: CountryCode;
  language: string;
  source: LeadSource;
  vehicleModel?: string;
  phone?: string;
};

function ascii(s: string): string {
  return s
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Loads returning-customer candidates from the seed generator (deterministic per SEED env). */
export function loadReturningPool(env: Record<string, string | undefined> = process.env): SimPayload[] {
  const seed = Number(env.SEED ?? '42');
  seedRng.reseed(seed);
  seedFaker(seed);
  setNow(defaultNow());
  resetReferences();
  resetIds(seed);
  return seedCustomers(600)
    .customers.filter((c) => c.phone && parsePhoneNumberFromString(c.phone)?.isValid())
    .map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName,
      country: c.country as CountryCode,
      language: c.language,
      source: 'WEBSITE' as LeadSource,
      phone: c.phone!,
      email: c.email ?? undefined,
      city: c.city ?? undefined,
      preferredChannel: c.preferredChannel,
    }));
}

export type Generator = { next(): SimPayload; isReturning(p: SimPayload): boolean };

export function createGenerator(
  opts: Pick<SimOptions, 'seed' | 'returning' | 'countries'>,
  pool: SimPayload[] = opts.returning > 0 ? loadReturningPool() : [],
): Generator {
  const rng = new SeededRng(opts.seed);
  for (const f of new Set(Object.values(LOCALES).concat(fakerEN))) f.seed(opts.seed);
  const returningSet = new WeakSet<object>();
  const eligible = pool.filter((p) => opts.countries.includes(p.country));

  const mobile = (country: CountryCode): string => {
    const [prefix, len] = MOBILE[country];
    for (let i = 0; i < 20; i++) {
      let digits = '';
      for (let j = 0; j < len; j++) digits += String(rng.int(0, 9));
      const num = `${COUNTRIES[country].dial}${prefix}${digits}`;
      if (parsePhoneNumberFromString(num)?.isValid()) return num;
    }
    return `${COUNTRIES[country].dial}${prefix}${'1'.repeat(len)}`;
  };

  const details = (base: SimPayload): SimPayload => {
    const budgetBase = vehiclePrice(base.vehicleModel ?? '') ?? 3_000_000;
    const budgetMax = Math.round((budgetBase * rng.float(0.9, 1.15)) / 100_000) * 100_000;
    const faker = LOCALES[base.country] ?? fakerEN;
    return {
      ...base,
      vehicleModel: base.vehicleModel,
      budgetMin: rng.chance(0.5) ? Math.round((budgetMax * 0.8) / 100_000) * 100_000 : undefined,
      budgetMax: rng.chance(0.7) ? budgetMax : undefined,
      hasTradeIn: rng.chance(0.3),
      wantsFinance: rng.chance(0.4),
      testDriveRequested: rng.chance(0.35),
      message: rng.chance(0.4) ? faker.lorem.sentence() : undefined,
      bestTime: rng.pick(['MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME'] as const),
      marketingConsent: rng.chance(0.5),
    };
  };

  return {
    isReturning: (p) => returningSet.has(p),
    next(): SimPayload {
      const source = rng.weightedPick(
        SOURCE_WEIGHTS.map(([s]) => s),
        SOURCE_WEIGHTS.map(([, w]) => w),
      );
      const vehicleModel = rng.chance(0.85) ? rng.pick(VEHICLE_SLUGS) : undefined;
      if (eligible.length > 0 && rng.chance(opts.returning)) {
        const p = rng.pick(eligible);
        const out = details({ ...p, source, vehicleModel });
        returningSet.add(out);
        return out;
      }
      const country = rng.pick(opts.countries);
      const faker = LOCALES[country] ?? fakerEN;
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = `${ascii(firstName)}.${ascii(lastName)}${rng.int(1, 9999)}@example.com`;
      const preferredChannel = rng.pick(['WHATSAPP', 'CALL', 'SMS', 'EMAIL'] as const);
      return details({
        firstName,
        lastName,
        country,
        language: COUNTRIES[country].lang,
        city: rng.pick(CITIES[country]),
        source,
        vehicleModel,
        email,
        phone: mobile(country),
        preferredChannel,
      });
    },
  };
}

type Outcome =
  | { ok: true; status: number; body: Record<string, unknown>; ms: number }
  | { ok: false; status: number; body: string; ms: number };

async function send(opts: SimOptions, payload: SimPayload): Promise<Outcome> {
  const t = performance.now();
  try {
    const res = await fetch(opts.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': opts.key },
      body: JSON.stringify(payload),
    });
    const ms = performance.now() - t;
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, body: text, ms };
    return { ok: true, status: res.status, body: JSON.parse(text), ms };
  } catch (err) {
    return { ok: false, status: 0, body: (err as Error).message, ms: performance.now() - t };
  }
}

const C = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', reset: '\x1b[0m' };

export type Summary = {
  sent: number;
  assigned: number;
  pool: number;
  returning: number;
  errors: number;
  avgLatencyMs: number;
};

export async function runSimulation(
  opts: SimOptions,
  gen: Generator,
  log: (line: string) => void = console.log,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
): Promise<{ summary: Summary; failed: boolean }> {
  const s = { sent: 0, assigned: 0, pool: 0, returning: 0, errors: 0, ms: 0 };
  let failed = false;

  const handle = (p: SimPayload, o: Outcome) => {
    s.sent++;
    s.ms += o.ms;
    const who = `${p.firstName} ${p.lastName} (${p.country}, ${p.language})`;
    if (!o.ok) {
      s.errors++;
      failed = true;
      log(`${C.red}✖ ${o.status || 'ERR'}  ${who}  ${o.body}${C.reset}`);
      return;
    }
    const b = o.body as {
      reference: string;
      status: string;
      assignedTo: { firstName: string } | null;
      team?: string;
      score?: number;
    };
    if (gen.isReturning(p)) s.returning++;
    if (b.assignedTo) s.assigned++;
    else s.pool++;
    const dest = b.assignedTo
      ? `→ ${b.team ? `${b.team} / ` : ''}${b.assignedTo.firstName}${b.score != null ? `  score ${b.score}` : ''}`
      : '→ pool';
    const colour = b.assignedTo ? C.green : C.yellow;
    const mark = b.assignedTo ? '✔' : '◌';
    log(
      `${colour}${mark} ${b.reference}  ${who}  ${p.vehicleModel ?? '-'}  ${p.source}  ${dest}${C.reset}`,
    );
  };

  const payloads: SimPayload[] = [];
  const total = opts.count === 0 ? Infinity : opts.count;
  if (opts.burst) {
    for (let i = 0; i < total; i++) payloads.push(gen.next());
    const outcomes = await Promise.all(payloads.map((p) => send(opts, p)));
    outcomes.forEach((o, i) => handle(payloads[i]!, o));
  } else {
    const interval = 60_000 / opts.rate;
    for (let i = 0; i < total; i++) {
      const p = gen.next();
      handle(p, await send(opts, p));
      if (failed && opts.failFast) break;
      if (i < total - 1) await sleep(interval);
    }
  }
  const summary: Summary = {
    sent: s.sent,
    assigned: s.assigned,
    pool: s.pool,
    returning: s.returning,
    errors: s.errors,
    avgLatencyMs: s.sent ? Math.round(s.ms / s.sent) : 0,
  };
  return { summary, failed };
}

async function main(): Promise<void> {
  const opts = parseSimArgs(process.argv.slice(2));
  console.log(
    `Simulating ${opts.count || '∞'} leads → ${opts.url} (${opts.burst ? 'burst' : `${opts.rate}/min`}, seed ${opts.seed})`,
  );
  const gen = createGenerator(opts);
  const { summary, failed } = await runSimulation(opts, gen);
  console.log(
    `\nSent ${summary.sent} · assigned ${summary.assigned} · pool ${summary.pool} · returning ${summary.returning} · errors ${summary.errors} · avg ${summary.avgLatencyMs} ms`,
  );
  if (failed && opts.failFast) process.exit(1);
}

if (/simulate\.[tj]s$/.test(process.argv[1] ?? '')) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
