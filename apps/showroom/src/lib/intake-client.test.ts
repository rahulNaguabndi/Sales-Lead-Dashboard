import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPayload, defaultValues } from './payload';
import { INTAKE_TIMEOUT_MS, submitEnquiry } from './intake-client';
import type { ShowroomEnv } from './env';

const env: ShowroomEnv = {
  intakeUrl: 'http://intake.test/leads',
  apiKey: 'k-123',
  showDemoToolbar: true,
  mockIntake: false,
};
const payload = buildPayload({
  ...defaultValues(),
  firstName: 'A',
  lastName: 'B',
  email: 'a@b.co',
});
const okBody = {
  reference: 'EDM-2026-00001',
  status: 'created',
  assignedTo: null,
  expectedContact: { channel: 'WHATSAPP', bestTime: 'ANYTIME' },
};
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe('submitEnquiry', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sends headers and parses 201 / 200', async () => {
    fetchMock.mockResolvedValueOnce(json(201, okBody));
    const r = await submitEnquiry(payload, 'idem-1', env);
    expect(r).toEqual({ ok: true, data: okBody });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(env.intakeUrl);
    expect(init.headers['X-API-Key']).toBe('k-123');
    expect(init.headers['Idempotency-Key']).toBe('idem-1');
    fetchMock.mockResolvedValueOnce(json(200, { ...okBody, status: 'duplicate' }));
    const d = await submitEnquiry(payload, 'idem-1', env);
    expect(d.ok && 'reference' in d.data && d.data.status).toBe('duplicate');
  });

  it('202 → accepted', async () => {
    fetchMock.mockResolvedValueOnce(json(202, { status: 'accepted' }));
    expect(await submitEnquiry(payload, 'k', env)).toEqual({
      ok: true,
      data: { status: 'accepted' },
    });
  });

  it('400 → validation fields', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        error: { code: 'VALIDATION_ERROR', fields: [{ path: 'email', message: 'bad' }] },
      }),
    );
    expect(await submitEnquiry(payload, 'k', env)).toEqual({
      ok: false,
      error: { kind: 'validation', fields: [{ path: 'email', message: 'bad' }] },
    });
  });

  it('400 with the API’s map-shaped fields keeps the field error (real server format)', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          fields: { phone: 'Invalid phone number for the selected country' },
        },
      }),
    );
    expect(await submitEnquiry(payload, 'k', env)).toEqual({
      ok: false,
      error: {
        kind: 'validation',
        fields: [{ path: 'phone', message: 'Invalid phone number for the selected country' }],
      },
    });
  });

  it('401, 413, 429, 415, 500, bad body', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(json(401, {}));
    expect((await submitEnquiry(payload, 'k', env)) as { error: unknown }).toMatchObject({
      error: { kind: 'unauthorized' },
    });
    expect(warn).toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(json(413, {}));
    expect(await submitEnquiry(payload, 'k', env)).toEqual({
      ok: false,
      error: { kind: 'too_large' },
    });
    fetchMock.mockResolvedValueOnce(json(429, {}, { 'Retry-After': '30' }));
    expect(await submitEnquiry(payload, 'k', env)).toEqual({
      ok: false,
      error: { kind: 'rate_limited', retryAfterSec: 30 },
    });
    fetchMock.mockResolvedValueOnce(json(415, {}));
    expect(await submitEnquiry(payload, 'k', env)).toEqual({
      ok: false,
      error: { kind: 'server', status: 415 },
    });
    fetchMock.mockResolvedValueOnce(json(500, {}));
    expect((await submitEnquiry(payload, 'k', env)) as { error: unknown }).toMatchObject({
      error: { kind: 'server', status: 500 },
    });
    fetchMock.mockResolvedValueOnce(json(201, { nope: true }));
    expect((await submitEnquiry(payload, 'k', env)) as { error: unknown }).toMatchObject({
      error: { kind: 'server' },
    });
    warn.mockRestore();
  });

  it('rejection → network', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('failed'));
    expect(await submitEnquiry(payload, 'k', env)).toEqual({
      ok: false,
      error: { kind: 'network' },
    });
  });

  it('aborts after 10 s → timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () =>
            rej(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const p = submitEnquiry(payload, 'k', env);
    await vi.advanceTimersByTimeAsync(INTAKE_TIMEOUT_MS + 1);
    expect(await p).toEqual({ ok: false, error: { kind: 'timeout' } });
  });

  it('mock mode resolves after 600 ms without fetch', async () => {
    vi.useFakeTimers();
    const p = submitEnquiry(payload, 'k', { ...env, mockIntake: true });
    await vi.advanceTimersByTimeAsync(600);
    const r = await p;
    expect(r.ok && 'reference' in r.data && r.data.reference).toMatch(/^EDM-2026-\d{5}$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
