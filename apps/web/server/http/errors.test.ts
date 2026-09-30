import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { NotFoundError, ValidationError, toErrorResponse } from './errors';

describe('toErrorResponse', () => {
  it('maps ValidationError to 400 with fields', () => {
    expect(
      toErrorResponse(new ValidationError('bad', { fields: { email: 'invalid' } })),
    ).toEqual({
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', message: 'bad', fields: { email: 'invalid' } } },
    });
  });

  it('maps NotFoundError to 404 without fields', () => {
    const r = toErrorResponse(new NotFoundError('lead'));
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
    expect(r.body.error).not.toHaveProperty('fields');
  });

  it('maps ZodError to 400 with a path-to-message map', () => {
    const parsed = z.object({ a: z.object({ b: z.string() }) }).safeParse({ a: {} });
    if (parsed.success) throw new Error('expected failure');
    const r = toErrorResponse(parsed.error);
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.fields ?? {})).toEqual(['a.b']);
  });

  it('maps unknown errors to 500 without leaking a stack trace', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = toErrorResponse(new Error('unknown'));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('INTERNAL_ERROR');
    expect(r.body.error.message).not.toMatch(/at .*\(|\.ts:\d+/);
    expect(r.body.error.message).not.toContain('unknown');
    spy.mockRestore();
  });
});
