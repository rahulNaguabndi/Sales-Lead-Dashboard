import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { setupIntakeEnv } from '../helpers/intake-db';

let server: http.Server;
let url: string;
let sim: typeof import('../../scripts/simulate');

beforeAll(async () => {
  await setupIntakeEnv();
  const route = await import('@/app/api/intake/leads/route');
  sim = await import('../../scripts/simulate');
  // Ephemeral port: other features build in parallel on this machine.
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const nreq = new NextRequest('http://localhost/api/intake/leads', {
      method: 'POST',
      headers,
      body: Buffer.concat(chunks),
    });
    const out = await route.POST(nreq);
    res.writeHead(out.status, { 'content-type': 'application/json' });
    res.end(await out.text());
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/intake/leads`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const opts = (over: Record<string, unknown> = {}) => ({
  ...sim.parseSimArgs(['--count', '3', '--seed', '1', '--rate', '6000', '--returning', '0'], {}),
  ...over,
});
const noSleep = () => Promise.resolve();

describe('simulator smoke', () => {
  it('sends 3 leads and gets 201 for each', async () => {
    const o = opts({ url });
    const lines: string[] = [];
    const { summary, failed } = await sim.runSimulation(
      o,
      sim.createGenerator(o, []),
      (l) => lines.push(l),
      noSleep,
    );
    expect(failed).toBe(false);
    expect(summary.sent).toBe(3);
    expect(summary.errors).toBe(0);
    expect(summary.assigned + summary.pool).toBe(3);
    expect(lines.every((l) => /EDM-\d{4}-\d{5}/.test(l))).toBe(true);
  });

  it('prints errors and continues against an unreachable URL; fail-fast stops', async () => {
    const dead = 'http://127.0.0.1:1/api/intake/leads';
    const o = opts({ url: dead });
    const lines: string[] = [];
    const r = await sim.runSimulation(o, sim.createGenerator(o, []), (l) => lines.push(l), noSleep);
    expect(r.summary.errors).toBe(3);
    expect(lines).toHaveLength(3);
    const f = opts({ url: dead, failFast: true });
    const r2 = await sim.runSimulation(f, sim.createGenerator(f, []), () => undefined, noSleep);
    expect(r2.summary.sent).toBe(1);
    expect(r2.failed).toBe(true);
  });
});
