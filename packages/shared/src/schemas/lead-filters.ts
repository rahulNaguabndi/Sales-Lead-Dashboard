import { z } from 'zod';
import { LEAD_SOURCES, PRIORITIES, STAGES } from '../enums';
import { SOURCE_GROUPS } from '../source-groups';

/** Comma-separated query string to an array validated by the item schema. */
const csv = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (v) =>
      typeof v === 'string'
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : v,
    z.array(item),
  );

const zBool = z.preprocess(
  (v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v),
  z.boolean(),
);

export const LeadListQuerySchema = z.object({
  view: z.enum(['mine', 'unassigned', 'due_today', 'going_cold', 'team', 'all']).optional(),
  stage: csv(z.enum(STAGES)).optional(),
  source: csv(z.enum(LEAD_SOURCES)).optional(),
  priority: csv(z.enum(PRIORITIES)).optional(),
  owner: csv(z.string()).optional(),
  team: csv(z.string()).optional(),
  returning: zBool.optional(),
  overdue: zBool.optional(),
  closed: zBool.optional(),
  sla: z.enum(['breached']).optional(),
  sourceGroup: z.enum(SOURCE_GROUPS).optional(),
  createdFrom: z.string().date().optional(),
  createdTo: z.string().date().optional(),
  // An empty or 1-character search (e.g. a cleared box) means "no search", never a 400.
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length >= 2 ? v : undefined)),
  sort: z
    .enum(['rank', 'newest', 'oldest_untouched', 'next_follow_up', 'score', 'last_activity'])
    .default('rank'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((n) => [10, 25, 50].includes(n), { message: 'pageSize must be 10, 25 or 50' })
    .default(25),
  tz: z.string().default('Europe/Berlin'),
});

export type LeadListQuery = z.infer<typeof LeadListQuerySchema>;
