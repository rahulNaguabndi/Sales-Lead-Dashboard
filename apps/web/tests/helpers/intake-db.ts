import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

export const DEV_KEY = 'showroom-dev-key';

/**
 * Points the app at a fresh migrated + seeded temp database with Redis unreachable (degraded
 * mode). Call before importing anything that touches the database.
 */
export async function setupIntakeEnv(): Promise<void> {
  process.env.JWT_SECRET = 'test-secret-'.padEnd(40, 'x');
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  process.env.INTAKE_API_KEYS = `showroom:${DEV_KEY}`;
  process.env.SHOWROOM_ORIGIN = 'http://localhost:3001';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-intake-'));
  process.env.DATABASE_URL = path.join(dir, 'test.db');
  const { openDatabase } = await import('@/server/db/client');
  const { runMigrations } = await import('@/server/db/migrate');
  const { seedDatabase } = await import('@/server/db/seed');
  const { sqlite, db } = openDatabase(process.env.DATABASE_URL);
  runMigrations(db);
  seedDatabase(db, { seed: 42, baseLeads: 10, silent: true });
  sqlite.close();
}

let n = 0;

/** A valid intake payload with a unique phone/email per call. */
export function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  n += 1;
  return {
    firstName: 'Test',
    lastName: `Lead${n}`,
    email: `test.lead${n}@example.com`,
    phone: `+491512${String(1000000 + n)}`,
    country: 'DE',
    city: 'Hamburg',
    language: 'de',
    preferredChannel: 'EMAIL',
    source: 'FACEBOOK',
    vehicleModel: 'aurora-suv',
    ...over,
  };
}

export function intakeReq(
  body: unknown,
  headers: Record<string, string> = {},
  method = 'POST',
): NextRequest {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return new NextRequest('http://localhost/api/intake/leads', {
    method,
    headers: { 'content-type': 'application/json', 'x-api-key': DEV_KEY, ...headers },
    body: method === 'POST' ? raw : undefined,
  });
}
