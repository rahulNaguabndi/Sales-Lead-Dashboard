import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { resolveDbPath } from './client';

// Deletes the database files, then migrates and seeds. On Windows a running dev server holds a
// lock on the file (EBUSY), so detect that and explain.
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
execSync('npm run db:migrate && npm run db:seed', { stdio: 'inherit' });
