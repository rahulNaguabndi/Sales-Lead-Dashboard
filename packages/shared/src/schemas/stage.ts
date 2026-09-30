import { z } from 'zod';
import { LOST_REASONS, STAGES } from '../enums';

export const MAX_DEAL_VALUE_CENTS = 100_000_000;

const base = { version: z.number().int().min(0) };
const OTHER_STAGES = STAGES.filter((s) => s !== 'WON' && s !== 'LOST') as unknown as [
  (typeof STAGES)[number],
  ...(typeof STAGES)[number][],
];

const won = z.object({
  ...base,
  to: z.literal('WON'),
  dealValue: z.number().int().positive().max(MAX_DEAL_VALUE_CENTS),
  vehicleModel: z.string().trim().min(1).max(100).optional(),
  appliedOfferId: z.string().min(1).max(64).nullish(),
});

const lost = z
  .object({
    ...base,
    to: z.literal('LOST'),
    lostReason: z.enum(LOST_REASONS),
    lostNote: z.string().trim().max(500).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.lostReason === 'OTHER' && (v.lostNote ?? '').length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['lostNote'],
        message: 'A note of 3–500 characters is required for "Other"',
      });
    }
  });

const other = z.object({
  ...base,
  to: z.enum(OTHER_STAGES),
  reason: z.string().trim().max(200).nullish(),
});

/** PATCH /api/leads/:id/stage body. Discriminated on `to` (WON and LOST carry closing data). */
export const StageChangeSchema = z.union([won, lost, other]);
export type StageChange = z.infer<typeof StageChangeSchema>;
