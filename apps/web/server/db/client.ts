import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

// Driver note: better-sqlite3 is the primary driver. If its native build fails on a platform
// (e.g. Node 24 on Windows ARM), replace the driver in this file with @libsql/client; the Drizzle
// instance type is the only thing the rest of the codebase depends on.

export type Db = BetterSQLite3Database<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function resolveDbPath(url = process.env.DATABASE_URL ?? './data/leaddesk.db'): string {
  return url.replace(/^file:/, '');
}

/** Opens a SQLite database with the standard connection settings (FR-011). */
export function openDatabase(file: string): { sqlite: Database.Database; db: Db } {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

const g = globalThis as unknown as { __db?: Db };

function getDb(): Db {
  // Singleton on globalThis so it survives Next.js hot reload.
  g.__db ??= openDatabase(resolveDbPath()).db;
  return g.__db;
}

/** Lazy proxy so importing this module never opens the database file. */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

/**
 * Runs fn inside a synchronous better-sqlite3 transaction. The ONLY sanctioned path for
 * multi-row writes: rolls back if fn throws, commits otherwise.
 */
export function withTx<T>(fn: (tx: Tx) => T): T {
  return getDb().transaction(fn);
}

export { schema };
