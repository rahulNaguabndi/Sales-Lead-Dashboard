import { z } from 'zod';
import { BEST_TIMES, CHANNELS, LANGUAGES } from '../enums';

const ID = z.string().min(1).max(64);

export const CustomerQuerySchema = z.object({ leadId: ID });

export const PatchPreferencesSchema = z
  .object({
    leadId: ID,
    preferredChannel: z.enum(CHANNELS).optional(),
    secondaryChannel: z.enum(CHANNELS).nullable().optional(),
    bestTime: z.enum(BEST_TIMES).optional(),
    language: z.enum(LANGUAGES).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.preferredChannel !== undefined ||
      v.secondaryChannel !== undefined ||
      v.bestTime !== undefined ||
      v.language !== undefined,
    { message: 'At least one preference is required' },
  )
  .refine(
    (v) =>
      !v.preferredChannel || !v.secondaryChannel || v.preferredChannel !== v.secondaryChannel,
    { message: 'Secondary channel must differ from the preferred channel', path: ['secondaryChannel'] },
  );

export type PatchPreferences = z.infer<typeof PatchPreferencesSchema>;
