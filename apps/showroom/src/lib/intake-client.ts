import { IntakeResponseSchema, type IntakeLead, type IntakeResponse } from '@leaddesk/shared';
import { getEnv, type ShowroomEnv } from './env';

export type IntakeError =
  | { kind: 'validation'; fields: { path: string; message: string }[] }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited'; retryAfterSec?: number }
  | { kind: 'too_large' }
  | { kind: 'timeout' }
  | { kind: 'network' }
  | { kind: 'server'; status: number };

export type IntakeResult =
  | { ok: true; data: IntakeResponse | { status: 'accepted' } }
  | { ok: false; error: IntakeError };

export const INTAKE_TIMEOUT_MS = 10_000;
export const MOCK_DELAY_MS = 600;

export async function submitEnquiry(
  payload: IntakeLead,
  key: string,
  env: ShowroomEnv = getEnv(),
): Promise<IntakeResult> {
  if (env.mockIntake) {
    await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
    const n = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    return {
      ok: true,
      data: {
        reference: `EDM-2026-${n}`,
        status: 'created',
        assignedTo: null,
        expectedContact: { channel: payload.preferredChannel, bestTime: payload.bestTime ?? 'ANYTIME' },
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTAKE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(env.intakeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': env.apiKey,
        'Idempotency-Key': key,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    return {
      ok: false,
      error: { kind: (e as { name?: string })?.name === 'AbortError' ? 'timeout' : 'network' },
    };
  } finally {
    clearTimeout(timer);
  }

  const body: unknown = await res.json().catch(() => undefined);
  switch (res.status) {
    case 200:
    case 201: {
      const parsed = IntakeResponseSchema.safeParse(body);
      return parsed.success
        ? { ok: true, data: parsed.data }
        : { ok: false, error: { kind: 'server', status: res.status } };
    }
    case 202:
      return { ok: true, data: { status: 'accepted' } };
    case 400: {
      const fields = (body as { error?: { fields?: unknown } } | undefined)?.error?.fields;
      const list = Array.isArray(fields)
        ? fields
            .filter((f): f is { path: string; message: string } => !!f && typeof f.path === 'string')
            .map((f) => ({ path: f.path, message: String(f.message ?? 'Invalid value') }))
        : [];
      return { ok: false, error: { kind: 'validation', fields: list } };
    }
    case 401:
      console.warn('Intake rejected the API key. Check VITE_INTAKE_API_KEY in apps/showroom/.env.');
      return { ok: false, error: { kind: 'unauthorized' } };
    case 413:
      return { ok: false, error: { kind: 'too_large' } };
    case 429: {
      const ra = Number(res.headers.get('Retry-After'));
      return {
        ok: false,
        error: { kind: 'rate_limited', retryAfterSec: Number.isFinite(ra) && ra > 0 ? ra : undefined },
      };
    }
    default:
      return { ok: false, error: { kind: 'server', status: res.status } };
  }
}
