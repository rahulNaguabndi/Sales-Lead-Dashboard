import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, sql, type SQL } from 'drizzle-orm';
import {
  CHANNELS,
  DEMO_BANDS,
  DEMO_MODELS,
  DEMOGRAPHICS_MIN_SAMPLE,
  DemographicsResponseSchema,
  SOURCE_GROUP_OF,
  VEHICLES,
  type DemoBand,
  type DemographicsQuery,
  type DemographicsResponse,
  type RawDemographics,
} from '@leaddesk/shared';
import { db as defaultDb, type Db } from '../db/client';
import { customers, leads } from '../db/schema';
import { leadScopeWhere } from '../policy/lead-filter';
import { getScope } from '../policy/scope';
import type { CurrentUser } from '../policy/types';
import { resolvePeriod } from '@/components/dashboard/demographics/_f16-stubs';

type Period = DemographicsResponse['period'];
type Parts = Pick<DemographicsResponse, 'conversion' | 'channelMix' | 'modelInterest'>;
type Channel = (typeof CHANNELS)[number];

const round1 = (n: number) => Math.round(n * 10) / 10;
const CHANNEL_NAME: Record<Channel, string> = {
  CALL: 'Call',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
};
const modelName = (slug: string) => VEHICLES.find((v) => v.slug === slug)?.name ?? slug;
const isBand = (b: string): b is DemoBand => (DEMO_BANDS as readonly string[]).includes(b);

/** Pure: applies the minimum-sample rules so suppressed values never leave the server (FR-006). */
export function applySuppression(
  raw: RawDemographics,
  period: Period,
  generatedAt: number,
): DemographicsResponse {
  const t = DEMOGRAPHICS_MIN_SAMPLE;

  const conversion = DEMO_BANDS.map((band): Parts['conversion'][number] => {
    const r = raw.conversion.find((c) => c.band === band);
    const closed = r?.closed ?? 0;
    if (closed < t.conversionMinClosed) return { band, closed, suppressed: true };
    const won = r?.won ?? 0;
    return { band, closed, won, conversionPct: round1((won / closed) * 100), suppressed: false };
  });

  const channelMix = DEMO_BANDS.map((band): Parts['channelMix'][number] => {
    const rows = raw.channel.filter((c) => c.band === band);
    const n = rows.reduce((s, r) => s + r.n, 0);
    if (n < t.channelMinLeads) return { band, n, suppressed: true };
    const share = (ch: Channel) => round1(((rows.find((r) => r.channel === ch)?.n ?? 0) / n) * 100);
    return {
      band,
      n,
      shares: { CALL: share('CALL'), WHATSAPP: share('WHATSAPP'), SMS: share('SMS'), EMAIL: share('EMAIL') },
      suppressed: false,
    };
  });

  // Catalog models first, then any unknown slug seen in the data (labelled by slug in the UI).
  const models = [
    ...DEMO_MODELS,
    ...new Set(raw.model.map((m) => m.model).filter((m) => !DEMO_MODELS.includes(m))),
  ];
  const rows = DEMO_BANDS.map((band) => {
    const inBand = raw.model.filter((m) => m.band === band);
    const n = inBand.reduce((s, r) => s + r.n, 0);
    const cells = models.map((model): Parts['modelInterest']['rows'][number]['cells'][number] => {
      const count = inBand.find((r) => r.model === model)?.n ?? 0;
      if (count < t.cellMinCount) return { model, suppressed: true };
      return { model, count, sharePct: round1((count / n) * 100), suppressed: false };
    });
    return { band, n, cells };
  });

  const modelInterest = { models, rows };
  return {
    period,
    thresholds: { ...t },
    excluded: { unknownAge: raw.excludedUnknownAge, noModel: raw.excludedNoModel },
    availableCountries: raw.availableCountries,
    conversion,
    orgConversionPct: raw.orgClosed > 0 ? round1((raw.orgWon / raw.orgClosed) * 100) : null,
    channelMix,
    modelInterest,
    insights: selectInsights({ conversion, channelMix, modelInterest }),
    generatedAt,
  };
}

/** Pure: deterministic insight lines from non-suppressed entries only. Ties break by band, then catalog order. */
export function selectInsights(input: Parts): DemographicsResponse['insights'] {
  const byBand = <T extends { band: DemoBand }>(xs: T[]) =>
    [...xs].sort((a, b) => DEMO_BANDS.indexOf(a.band) - DEMO_BANDS.indexOf(b.band));
  const p: Parts = {
    conversion: byBand(input.conversion),
    channelMix: byBand(input.channelMix),
    modelInterest: { ...input.modelInterest, rows: byBand(input.modelInterest.rows) },
  };
  const out: DemographicsResponse['insights'] = {};

  let conv: { band: DemoBand; pct: number } | null = null;
  for (const c of p.conversion) {
    if (!c.suppressed && (!conv || c.conversionPct > conv.pct)) conv = { band: c.band, pct: c.conversionPct };
  }
  if (conv) out.conversion = `Ages ${conv.band} convert best at ${conv.pct}%.`;

  let ch: { band: DemoBand; channel: Channel; pct: number } | null = null;
  for (const m of p.channelMix) {
    if (m.suppressed) continue;
    for (const c of CHANNELS) {
      if (!ch || m.shares[c] > ch.pct) ch = { band: m.band, channel: c, pct: m.shares[c] };
    }
  }
  if (ch) out.channelMix = `${CHANNEL_NAME[ch.channel]} is the top channel for ages ${ch.band} (${ch.pct}%).`;

  let mod: { band: DemoBand; model: string; pct: number } | null = null;
  for (const r of p.modelInterest.rows) {
    for (const c of r.cells) {
      if (!c.suppressed && (!mod || c.sharePct > mod.pct)) mod = { band: r.band, model: c.model, pct: c.sharePct };
    }
  }
  if (mod) out.modelInterest = `${modelName(mod.model)} is the most requested model for ages ${mod.band} (${mod.pct}%).`;

  return out;
}

/** Scoped aggregate queries (read-only), then suppression, then schema validation. */
export async function getDemographics(
  user: CurrentUser,
  filters: DemographicsQuery,
  database: Db = defaultDb,
  now = Date.now(),
): Promise<DemographicsResponse> {
  const scope = await getScope(user.id);
  const period = resolvePeriod(filters.range, filters, now);

  const base: SQL[] = [leadScopeWhere(scope)];
  // teamId narrows only for org-wide viewers; managers stay bound to their own scope.
  if (filters.teamId && scope.isOrgWide) base.push(eq(leads.teamId, filters.teamId));
  if (filters.sourceGroup) {
    const sources = Object.entries(SOURCE_GROUP_OF)
      .filter(([, g]) => g === filters.sourceGroup)
      .map(([s]) => s as keyof typeof SOURCE_GROUP_OF);
    base.push(inArray(leads.source, sources));
  }
  if (filters.country) base.push(eq(customers.country, filters.country));

  const known = ne(customers.ageBand, 'UNKNOWN');
  const created = and(gte(leads.createdAt, period.from), lte(leads.createdAt, period.to));
  const closedIn = and(
    inArray(leads.stage, ['WON', 'LOST']),
    gte(leads.closedAt, period.from),
    lte(leads.closedAt, period.to),
  );
  const cnt = sql<number>`count(*)`;
  const won = sql<number>`sum(case when ${leads.stage} = 'WON' then 1 else 0 end)`;

  const conversion = database
    .select({ band: customers.ageBand, closed: cnt, won })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .where(and(...base, known, closedIn))
    .groupBy(customers.ageBand)
    .all();

  const channel = database
    .select({ band: customers.ageBand, channel: customers.preferredChannel, n: cnt })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .where(and(...base, known, created))
    .groupBy(customers.ageBand, customers.preferredChannel)
    .all();

  const model = database
    .select({ band: customers.ageBand, model: leads.vehicleModel, n: cnt })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .where(and(...base, known, created, isNotNull(leads.vehicleModel)))
    .groupBy(customers.ageBand, leads.vehicleModel)
    .all();

  const count = (extra: SQL | undefined) =>
    database
      .select({ n: cnt })
      .from(leads)
      .innerJoin(customers, eq(customers.id, leads.customerId))
      .where(and(...base, extra))
      .get()?.n ?? 0;

  const org = database
    .select({ closed: cnt, won })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .where(and(...base, known, closedIn))
    .get();

  // Country options ignore the country filter itself so the picker never collapses to one entry.
  const countryBase = base.slice(0, filters.country ? -1 : undefined);
  const countries = database
    .selectDistinct({ country: customers.country })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .where(and(...countryBase))
    .orderBy(customers.country)
    .all()
    .map((r) => r.country);

  const raw: RawDemographics = {
    conversion: conversion
      .filter((r) => isBand(r.band))
      .map((r) => ({ band: r.band as DemoBand, closed: Number(r.closed), won: Number(r.won ?? 0) })),
    channel: channel
      .filter((r) => isBand(r.band))
      .map((r) => ({ band: r.band as DemoBand, channel: r.channel, n: Number(r.n) })),
    model: model
      .filter((r) => isBand(r.band) && r.model)
      .map((r) => ({ band: r.band as DemoBand, model: r.model as string, n: Number(r.n) })),
    orgClosed: Number(org?.closed ?? 0),
    orgWon: Number(org?.won ?? 0),
    excludedUnknownAge: Number(count(and(eq(customers.ageBand, 'UNKNOWN'), created))),
    excludedNoModel: Number(count(and(known, created, isNull(leads.vehicleModel)))),
    availableCountries: countries,
  };
  return DemographicsResponseSchema.parse(applySuppression(raw, period, now));
}
