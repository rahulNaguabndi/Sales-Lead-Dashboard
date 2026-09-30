import { describe, expect, it, vi } from 'vitest';
import { resolveScope, scopeCacheKey } from '../scope';
import { NotFoundError } from '../../http/errors';
import { buildCycle, buildFourLevels, createFixture } from './fixtures';

describe('resolveScope', () => {
  const fx = createFixture();

  it('manager scope = self + reports, own team', async () => {
    const s = await resolveScope('lukas', fx.db);
    expect([...s.userIds].sort()).toEqual(['anna', 'felix', 'jonas', 'lea', 'lukas']);
    expect([...s.teamIds]).toEqual(['dach']);
    expect(s.isOrgWide).toBe(false);
    expect(s.role).toBe('MANAGER');
  });

  it('VP scope = all 16 users and 3 teams, org wide', async () => {
    const s = await resolveScope('isabelle', fx.db);
    expect(s.userIds.size).toBe(16);
    expect(s.teamIds.size).toBe(3);
    expect(s.isOrgWide).toBe(true);
  });

  it('rep scope = self + own team', async () => {
    const s = await resolveScope('sofia', fx.db);
    expect([...s.userIds]).toEqual(['sofia']);
    expect([...s.teamIds]).toEqual(['south']);
  });

  it('manager with no reports = self + own team', async () => {
    fx.sqlite.exec(
      `INSERT INTO users (id, name, email, password_hash, role, manager_id, team_id, languages, avatar_color, created_at)
       VALUES ('solo', 's', 'solo@x.test', 'h', 'MANAGER', 'isabelle', 'west', '[]', 'blue', 1)`,
    );
    const s = await resolveScope('solo', fx.db);
    expect([...s.userIds]).toEqual(['solo']);
    expect([...s.teamIds]).toEqual(['west']);
  });

  it('4-level fixture includes all descendants (matrix row 36)', async () => {
    const { db, ids } = buildFourLevels();
    const s = await resolveScope('top', db);
    expect([...s.userIds].sort()).toEqual([...ids].sort());
    expect((await resolveScope('low', db)).userIds.size).toBe(2);
  });

  it('cycle fixture terminates and logs an error', async () => {
    const { db } = buildCycle();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = await resolveScope('a', db);
    expect([...s.userIds].sort()).toEqual(['a', 'b', 'c']);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('unknown user -> NotFoundError', async () => {
    await expect(resolveScope('nobody', fx.db)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('scopeCacheKey format', () => {
    expect(scopeCacheKey('u1')).toBe('scope:u1');
  });
});
