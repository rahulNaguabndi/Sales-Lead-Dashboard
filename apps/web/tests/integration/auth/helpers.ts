import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

export const PASSWORD = 'demo1234';
export const SOFIA = 'sofia.rossi@eurodrive.test';

/** Points the app at a fresh migrated + seeded temp database. Call before importing route modules. */
export async function setupAuthEnv(): Promise<void> {
  process.env.JWT_SECRET = 'test-secret-'.padEnd(40, 'x');
  process.env.REDIS_URL = 'redis://127.0.0.1:1'; // unreachable: exercises degraded mode
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-auth-'));
  process.env.DATABASE_URL = path.join(dir, 'test.db');
  const { openDatabase } = await import('@/server/db/client');
  const { runMigrations } = await import('@/server/db/migrate');
  const { seedDatabase } = await import('@/server/db/seed');
  const { sqlite, db } = openDatabase(process.env.DATABASE_URL);
  runMigrations(db);
  seedDatabase(db, { seed: 42, baseLeads: 10, silent: true });
  sqlite.close();
}

export function req(
  url: string,
  init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {},
): NextRequest {
  const headers: Record<string, string> = { ...init.headers };
  if (init.cookie) headers.cookie = init.cookie;
  let body: string | undefined;
  if (init.body !== undefined) {
    body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
    headers['content-type'] = 'application/json';
  }
  return new NextRequest(`http://localhost${url}`, { method: init.method ?? 'GET', headers, body });
}

export function cookieFrom(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  return raw.split(';')[0] ?? '';
}
