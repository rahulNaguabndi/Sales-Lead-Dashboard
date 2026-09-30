import { describe, expect, it } from 'vitest';
import { openDatabase } from '@/server/db/client';
import { runMigrations } from '@/server/db/migrate';
import { formatReference, nextReference } from '@/server/services/intake';

describe('formatReference', () => {
  it('zero-pads to five digits', () => {
    expect(formatReference(2026, 812)).toBe('EDM-2026-00812');
    expect(formatReference(2026, 1)).toBe('EDM-2026-00001');
  });
});

describe('nextReference', () => {
  it('is max+1 within the UTC year and restarts on rollover', () => {
    const { sqlite, db } = openDatabase(':memory:');
    runMigrations(db);
    sqlite.pragma('foreign_keys = OFF');
    const ins = sqlite.prepare(
      `INSERT INTO leads (id, reference, customer_id, team_id, source, score_breakdown, created_at, updated_at)
       VALUES (?, ?, 'c', 't', 'WEBSITE', '{}', 1, 1)`,
    );
    const dec = Date.UTC(2026, 11, 31, 23, 59);
    const jan = Date.UTC(2027, 0, 1, 0, 1);
    expect(nextReference(db, dec)).toBe('EDM-2026-00001');
    ins.run('a', 'EDM-2026-00811');
    ins.run('b', 'EDM-2026-00812');
    expect(nextReference(db, dec)).toBe('EDM-2026-00813');
    expect(nextReference(db, jan)).toBe('EDM-2027-00001');
  });
});
