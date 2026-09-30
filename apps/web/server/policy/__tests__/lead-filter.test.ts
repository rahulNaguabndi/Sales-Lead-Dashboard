import { describe, expect, it } from 'vitest';
import { leads } from '../../db/schema';
import { isLeadVisible, leadScopeWhere } from '../lead-filter';
import { resolveScope } from '../scope';
import { createFixture } from './fixtures';

describe('leadScopeWhere', () => {
  const fx = createFixture();
  const visibleIds = async (userId: string) => {
    const scope = await resolveScope(userId, fx.db);
    return fx.db
      .select({ id: leads.id })
      .from(leads)
      .where(leadScopeWhere(scope))
      .all()
      .map((r) => r.id)
      .sort();
  };

  it('rep sees own leads + team pool (rows 1-4)', async () => {
    expect(await visibleIds('anna')).toEqual(['L1', 'L3', 'L5']);
    expect(await visibleIds('sofia')).toEqual(['L2', 'L4']);
  });

  it('manager sees whole team (rows 16-17)', async () => {
    const ids = await visibleIds('lukas');
    expect(ids).toEqual(['L1', 'L3', 'L5', 'L6', 'L8']);
    expect(ids).not.toContain('L2');
  });

  it('VP sees everything (row 29)', async () => {
    expect((await visibleIds('isabelle')).length).toBe(9);
  });

  it('SQL filter equals isLeadVisible for every persona and lead', async () => {
    for (const userId of Object.keys(fx.users)) {
      const scope = await resolveScope(userId, fx.db);
      const sqlIds = await visibleIds(userId);
      const tsIds = Object.values(fx.leads)
        .filter((l) => isLeadVisible(scope, l))
        .map((l) => l.id)
        .sort();
      expect(sqlIds, userId).toEqual(tsIds);
    }
  });
});
