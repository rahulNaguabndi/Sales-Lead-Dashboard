import { z } from 'zod';
import { CHANNELS } from './enums';
import { VEHICLE_SLUGS } from './catalog';
import { SOURCE_GROUPS } from './source-groups';

/** Minimum sample sizes below which a metric is suppressed server-side (F17 FR-006). */
export const DEMOGRAPHICS_MIN_SAMPLE = {
  conversionMinClosed: 20,
  channelMinLeads: 30,
  cellMinCount: 5,
} as const;

/** Known age bands in display order (UNKNOWN is excluded from every chart). */
export const DEMO_BANDS = ['18-25', '26-35', '36-45', '46-60', '60+'] as const;
export type DemoBand = (typeof DEMO_BANDS)[number];

export const DEMO_MODELS: readonly string[] = VEHICLE_SLUGS;

export const DEMOGRAPHICS_RANGES = ['today', '7d', '30d', '90d', 'custom'] as const;
export type DemographicsRange = (typeof DEMOGRAPHICS_RANGES)[number];

export const DemographicsQuerySchema = z
  .object({
    range: z.enum(DEMOGRAPHICS_RANGES).default('90d'),
    from: z.coerce.number().int().nonnegative().optional(),
    to: z.coerce.number().int().nonnegative().optional(),
    teamId: z.string().min(1).max(64).optional(),
    sourceGroup: z.enum(SOURCE_GROUPS).optional(),
    country: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .transform((s) => s.toUpperCase())
      .optional(),
  })
  .strict()
  .refine((q) => q.range !== 'custom' || (q.from !== undefined && q.to !== undefined && q.from <= q.to), {
    message: 'custom range requires from <= to',
    path: ['from'],
  });
export type DemographicsQuery = z.infer<typeof DemographicsQuerySchema>;

const Band = z.enum(DEMO_BANDS);
const Channel = z.enum(CHANNELS);

export const ConversionEntrySchema = z.discriminatedUnion('suppressed', [
  z
    .object({
      band: Band,
      closed: z.number().int(),
      won: z.number().int(),
      conversionPct: z.number(),
      suppressed: z.literal(false),
    })
    .strict(),
  z.object({ band: Band, closed: z.number().int(), suppressed: z.literal(true) }).strict(),
]);

export const ChannelMixEntrySchema = z.discriminatedUnion('suppressed', [
  z
    .object({
      band: Band,
      n: z.number().int(),
      shares: z.object({ CALL: z.number(), WHATSAPP: z.number(), SMS: z.number(), EMAIL: z.number() }).strict(),
      suppressed: z.literal(false),
    })
    .strict(),
  z.object({ band: Band, n: z.number().int(), suppressed: z.literal(true) }).strict(),
]);

export const HeatmapCellSchema = z.discriminatedUnion('suppressed', [
  z
    .object({ model: z.string(), count: z.number().int(), sharePct: z.number(), suppressed: z.literal(false) })
    .strict(),
  z.object({ model: z.string(), suppressed: z.literal(true) }).strict(),
]);

export const DemographicsResponseSchema = z
  .object({
    period: z.object({ from: z.number(), to: z.number(), range: z.enum(DEMOGRAPHICS_RANGES) }).strict(),
    thresholds: z
      .object({ conversionMinClosed: z.number(), channelMinLeads: z.number(), cellMinCount: z.number() })
      .strict(),
    excluded: z.object({ unknownAge: z.number().int(), noModel: z.number().int() }).strict(),
    availableCountries: z.array(z.string()),
    conversion: z.array(ConversionEntrySchema),
    orgConversionPct: z.number().nullable(),
    channelMix: z.array(ChannelMixEntrySchema),
    modelInterest: z
      .object({
        models: z.array(z.string()),
        rows: z.array(
          z.object({ band: Band, n: z.number().int(), cells: z.array(HeatmapCellSchema) }).strict(),
        ),
      })
      .strict(),
    insights: z
      .object({
        conversion: z.string().optional(),
        channelMix: z.string().optional(),
        modelInterest: z.string().optional(),
      })
      .strict(),
    generatedAt: z.number(),
  })
  .strict();
export type DemographicsResponse = z.infer<typeof DemographicsResponseSchema>;
export type ConversionEntry = z.infer<typeof ConversionEntrySchema>;
export type ChannelMixEntry = z.infer<typeof ChannelMixEntrySchema>;
export type HeatmapCell = z.infer<typeof HeatmapCellSchema>;
export type HeatmapRow = DemographicsResponse['modelInterest']['rows'][number];

/** Raw grouped counts handed to `applySuppression` (F17 service). */
export type RawDemographics = {
  conversion: { band: DemoBand; closed: number; won: number }[];
  channel: { band: DemoBand; channel: (typeof CHANNELS)[number]; n: number }[];
  model: { band: DemoBand; model: string; n: number }[];
  orgClosed: number;
  orgWon: number;
  excludedUnknownAge: number;
  excludedNoModel: number;
  availableCountries: string[];
};
