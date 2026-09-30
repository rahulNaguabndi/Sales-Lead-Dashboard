import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .enum(['true', 'false'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true');

const EnvSchema = z.object({
  VITE_INTAKE_URL: z.string().url().default('http://localhost:3000/api/intake/leads'),
  VITE_INTAKE_API_KEY: z.string().min(1).default('showroom-dev-key'),
  VITE_SHOW_DEMO_TOOLBAR: bool(true),
  VITE_MOCK_INTAKE: bool(false),
});

export function parseEnv(raw: Record<string, unknown>) {
  const e = EnvSchema.parse(raw);
  return {
    intakeUrl: e.VITE_INTAKE_URL,
    apiKey: e.VITE_INTAKE_API_KEY,
    showDemoToolbar: e.VITE_SHOW_DEMO_TOOLBAR,
    mockIntake: e.VITE_MOCK_INTAKE,
  };
}

export type ShowroomEnv = ReturnType<typeof parseEnv>;

export function getEnv(): ShowroomEnv {
  return parseEnv(import.meta.env as Record<string, unknown>);
}
