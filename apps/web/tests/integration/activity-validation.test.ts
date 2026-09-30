import { beforeAll, describe, expect, it } from 'vitest';
import { EMAIL, ok, setupActivityEnv, type Ctx } from './activity-helpers';

let c: Ctx;
let sofia: string;
let lead: string;
beforeAll(async () => {
  c = await setupActivityEnv();
  sofia = await c.login(EMAIL.sofia);
  lead = c.createLead();
});

async function expect400(body: unknown, field: string) {
  const before = c.counts();
  const res = await c.post(sofia, lead, body);
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error.code).toBe('VALIDATION_ERROR');
  expect(json.error.fields[field]).toBeTruthy();
  expect(c.counts()).toEqual(before);
}

describe('activity validation', () => {
  it('rejects empty and whitespace notes', async () => {
    await expect400(ok({ note: '' }), 'note');
    await expect400(ok({ note: '   \n ' }), 'note');
  });
  it('rejects an outcome on a Note', async () => {
    await expect400(ok({ type: 'NOTE', outcome: 'CONNECTED' }), 'outcome');
  });
  it('rejects a Call without an outcome', async () => {
    await expect400(ok({ outcome: undefined }), 'outcome');
  });
  it('rejects a 2001-character note', async () => {
    await expect400(ok({ note: 'x'.repeat(2001) }), 'note');
  });
  it('rejects malformed JSON and oversized bodies', async () => {
    const bad = await c.post(sofia, lead, '{not json');
    expect(bad.status).toBe(400);
    const big = await c.post(sofia, lead, ok({ note: 'x'.repeat(17_000) }));
    expect(big.status).toBe(400);
  });
});
