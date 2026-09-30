import { z } from 'zod';
import { OPEN_STAGES, OUTCOMES, USER_ACTIVITY_TYPES } from '../enums';

export const CreateActivitySchema = z.object({
  clientRequestId: z.string().length(26),
  type: z.enum(USER_ACTIVITY_TYPES),
  outcome: z.enum(OUTCOMES).optional(),
  note: z.string().trim().min(1).max(2000),
  aiAssisted: z.boolean().default(false),
  nextFollowUp: z
    .object({
      dueAt: z.string().datetime(),
      note: z.string().trim().max(200).optional(),
    })
    .optional(),
  completeFollowUpId: z.string().optional(),
  stageChange: z.object({ to: z.enum(OPEN_STAGES) }).optional(),
  expectedVersion: z.number().int().optional(),
});

export type CreateActivity = z.infer<typeof CreateActivitySchema>;
