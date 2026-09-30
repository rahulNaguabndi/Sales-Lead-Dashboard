import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { openDatabase, resolveDbPath, type Db } from './client';

export const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

if (require.main === module) {
  const file = resolveDbPath();
  const { sqlite, db } = openDatabase(file);
  runMigrations(db);
  sqlite.close();
  console.log(`Migrations applied to ${file}`);
}
