import { z } from 'zod';
import { ASSIGN_STRATEGIES } from '../enums';

export const MAX_BULK_ASSIGN = 100;

export const assignBodySchema = z.object({
  toUserId: z.string().min(1).nullable(),
  reason: z.string().max(500).optional(),
  version: z.number().int().optional(),
});
export type AssignBody = z.infer<typeof assignBodySchema>;

export const bulkAssignBodySchema = z.object({
  leadIds: z.array(z.string().min(1)).min(1).max(MAX_BULK_ASSIGN),
  toUserId: z.string().min(1).nullable(),
  reason: z.string().max(500).optional(),
});
export type BulkAssignBody = z.infer<typeof bulkAssignBodySchema>;

export const teamSettingsPatchSchema = z.object({
  autoAssign: z.boolean(),
  assignStrategy: z.enum(ASSIGN_STRATEGIES),
  reps: z
    .array(
      z.object({
        id: z.string().min(1),
        isActive: z.boolean().optional(),
        maxOpenLeads: z.number().int().min(1).max(500).optional(),
      }),
    )
    .optional(),
});
export type TeamSettingsPatch = z.infer<typeof teamSettingsPatchSchema>;

export type AssigneeDTO = {
  id: string;
  name: string;
  openLeads: number;
  languages: string[];
  languageMatch: boolean;
  atLimit: boolean;
};

export type TeamSettingsDTO = {
  id: string;
  name: string;
  autoAssign: boolean;
  assignStrategy: (typeof ASSIGN_STRATEGIES)[number];
  reps: {
    id: string;
    name: string;
    isActive: boolean;
    maxOpenLeads: number;
    openLeads: number;
    languages: string[];
  }[];
};
