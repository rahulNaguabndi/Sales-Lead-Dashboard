import { z } from 'zod';
import { VEHICLE_SLUGS } from '../catalog';
import { COUNTRY_CODES } from '../countries';
import { AGE_BANDS, BEST_TIMES, CHANNELS, LANGUAGES, LEAD_SOURCES } from '../enums';

export const IntakeLeadSchema = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{6,20}$/)
      .optional(),
    country: z.enum(COUNTRY_CODES),
    city: z.string().trim().max(80).optional(),
    age: z.number().int().min(18).max(100).optional(),
    ageBand: z.enum(AGE_BANDS).default('UNKNOWN'),
    language: z.enum(LANGUAGES),
    preferredChannel: z.enum(CHANNELS),
    secondaryChannel: z.enum(CHANNELS).optional(),
    bestTime: z.enum(BEST_TIMES).default('ANYTIME'),
    vehicleModel: z.enum(VEHICLE_SLUGS).optional(),
    budgetMin: z.number().int().nonnegative().optional(),
    budgetMax: z.number().int().positive().max(50_000_000).optional(),
    hasTradeIn: z.boolean().default(false),
    wantsFinance: z.boolean().default(false),
    testDriveRequested: z.boolean().default(false),
    message: z.string().trim().max(2000).optional(),
    source: z.enum(LEAD_SOURCES).default('WEBSITE'),
    sourceDetail: z.string().trim().max(120).optional(),
    marketingConsent: z.boolean().default(false),
    idempotencyKey: z.string().max(64).optional(),
    website: z.string().optional(),
  })
  .refine((d) => d.email || d.phone, { message: 'Email or phone is required', path: ['email'] })
  .refine((d) => (d.preferredChannel === 'EMAIL' ? !!d.email : !!d.phone), {
    message: 'Contact detail for preferred channel is required',
    path: ['preferredChannel'],
  })
  .refine((d) => d.budgetMin == null || d.budgetMax == null || d.budgetMin <= d.budgetMax, {
    message: 'Minimum budget exceeds maximum',
    path: ['budgetMin'],
  });

export type IntakeLead = z.infer<typeof IntakeLeadSchema>;

export const IntakeResponseSchema = z.object({
  reference: z.string(),
  status: z.enum(['created', 'duplicate']),
  assignedTo: z.object({ firstName: z.string() }).nullable(),
  expectedContact: z.object({ channel: z.enum(CHANNELS), bestTime: z.enum(BEST_TIMES) }),
});
export type IntakeResponse = z.infer<typeof IntakeResponseSchema>;
