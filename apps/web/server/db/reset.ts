import fs from 'node:fs';
import { openDatabase, resolveDbPath } from './client';
import { runMigrations } from './migrate';
import { printSummary, seedDatabase } from './seed';

// Deletes the database files, then migrates and seeds in-process. On Windows a running dev
// server holds a lock on the file (EBUSY), so detect that and explain.
const file = resolveDbPath();
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.rmSync(file + suffix, { force: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EBUSY' || code === 'EPERM') {
      console.error('Cannot delete the database: it is in use. Stop the dev server first.');
      process.exit(1);
    }
    throw err;
  }
}

const { sqlite, db } = openDatabase(file);
try {
  runMigrations(db);
  printSummary(seedDatabase(db));
} finally {
  sqlite.close();
}
