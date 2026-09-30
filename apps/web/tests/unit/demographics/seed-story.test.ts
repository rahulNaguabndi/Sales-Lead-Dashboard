import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CHANNELS } from '@leaddesk/shared';

// Full-size seed (default 750 leads): checks the demo story (SC-003) and the latency budget (SC-004).
let svc: typeof import('@/server/services/demographics');
let vp: never;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-'.padEnd(40, 'x');
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  process.env.DATABASE_URL = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ld-demo-')), 'full.db');
  const { openDatabase } = await import('@/server/db/client');
  const { runMigrations } = await import('@/server/db/migrate');
  const { seedDatabase } = await import('@/server/db/seed');
  const { sqlite, db } = openDatabase(process.env.DATABASE_URL);
  runMigrations(db);
  seedDatabase(db, { seed: 42, silent: true });
  vp = sqlite.prepare(`select id, role, team_id as teamId from users where email = 'isabelle.laurent@eurodrive.test'`).get() as never;
  svc = await import('@/server/services/demographics');
}, 120_000);

describe('seed story', () => {
  it('has a WhatsApp-led band and a Call-led band, served under 800 ms', async () => {
    const t0 = performance.now();
    const out = await svc.getDemographics(vp, { range: '90d' });
    expect(performance.now() - t0).toBeLessThan(800);
    const top = out.channelMix.flatMap((m) =>
      m.suppressed ? [] : [CHANNELS.reduce((a, b) => (m.shares[b] > m.shares[a] ? b : a))],
    );
    expect(top).toContain('WHATSAPP');
    expect(top).toContain('CALL');
  });
});
