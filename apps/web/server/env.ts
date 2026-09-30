import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JOBS_ENABLED: bool.default('true'),
  AT_RISK_DAYS: z.coerce.number().int().positive().default(3),
  COLD_AFTER_DAYS: z.coerce.number().int().positive().default(7),
  COLD_AFTER_UNANSWERED: z.coerce.number().int().positive().default(3),
  MISSED_AFTER_HOURS: z.coerce.number().int().positive().default(24),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5-5'),
  AI_EFFORT: z.string().default('low'),
  AI_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof EnvSchema>;

/** Throws a readable error listing every missing/invalid variable (FR-004). */
export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty strings (e.g. "ANTHROPIC_API_KEY=") as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Validated, typed environment (validated on first access and at startup via instrumentation). */
export function getEnv(): Env {
  cached ??= validateEnv();
  return cached;
}
