import bcrypt from 'bcryptjs';
import { stripDiacritics } from '@leaddesk/shared';
import { rng } from './utils/rng';
import { clock, DAY } from './utils/time';
import { newId } from './utils/ids';
import type { OrgResult, TeamRow, UserRow } from './types';

export const DEMO_PASSWORD = 'demo1234';

type RepDef = { name: string; languages: string[] };

const ORG = {
  vp: { name: 'Isabelle Laurent', languages: ['fr', 'en', 'de'] },
  teams: [
    {
      name: 'Team DACH',
      region: 'DACH' as const,
      countries: ['DE', 'AT', 'CH'],
      strategy: 'LANGUAGE_MATCH' as const,
      manager: { name: 'Lukas Becker', languages: ['de', 'en'] },
      reps: [
        { name: 'Anna Weber', languages: ['de', 'en'] },
        { name: 'Jonas Fischer', languages: ['de', 'en'] },
        { name: 'Lea Hoffmann', languages: ['de', 'fr'] },
        { name: 'Felix Wagner', languages: ['de', 'en', 'pl'] },
      ] as RepDef[],
    },
    {
      name: 'Team West',
      region: 'WEST' as const,
      countries: ['FR', 'BE', 'NL', 'LU'],
      strategy: 'LOAD_BALANCED' as const,
      manager: { name: 'Claire Martin', languages: ['fr', 'en', 'nl'] },
      reps: [
        { name: 'Émile Dubois', languages: ['fr', 'en'] },
        { name: 'Jan de Vries', languages: ['nl', 'en', 'de'] },
        { name: 'Camille Leroy', languages: ['fr', 'nl'] },
        { name: 'Thomas Peeters', languages: ['nl', 'fr', 'en'] },
      ] as RepDef[],
    },
    {
      name: 'Team South',
      region: 'SOUTH' as const,
      countries: ['IT', 'ES', 'PT'],
      strategy: 'ROUND_ROBIN' as const,
      manager: { name: 'Marco Bianchi', languages: ['it', 'en'] },
      reps: [
        { name: 'Sofia Rossi', languages: ['it', 'en', 'es'] },
        { name: 'Marta García', languages: ['es', 'en'] },
        { name: 'Luca Romano', languages: ['it', 'en'] },
        { name: 'João Silva', languages: ['pt', 'es', 'en'] },
      ] as RepDef[],
    },
  ],
};

// Per-rep conversion multipliers so dashboards show clear winners and laggards.
const REP_FACTORS = [1.3, 0.8, 1.0, 0.9, 1.25, 0.75, 1.05, 0.85, 1.4, 0.7, 1.0, 0.95];

const COLORS = ['blue', 'emerald', 'amber', 'rose', 'violet', 'cyan', 'orange', 'lime'];

export function emailFor(name: string): string {
  const [first, ...rest] = stripDiacritics(name).toLowerCase().split(' ');
  return `${first}.${rest.join('')}@eurodrive.test`.replace(/[^a-z0-9.@]/g, '');
}

export function seedOrg(): OrgResult {
  const createdAt = clock.now - 365 * DAY;
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const teams: TeamRow[] = [];
  const users: UserRow[] = [];
  const teamByRegion: Record<string, string> = {};
  const repsByTeam: Record<string, string[]> = {};
  const repIdByName: Record<string, string> = {};
  const repFactor: Record<string, number> = {};
  const managerIds: string[] = [];
  let colorIdx = 0;

  const mkUser = (
    def: RepDef,
    role: 'REP' | 'MANAGER' | 'VP',
    managerId: string | null,
    teamId: string | null,
  ): UserRow => {
    const user: UserRow = {
      id: newId(createdAt),
      name: def.name,
      email: emailFor(def.name),
      passwordHash,
      role,
      managerId,
      teamId,
      languages: def.languages,
      avatarColor: COLORS[colorIdx++ % COLORS.length] as string,
      isActive: true,
      maxOpenLeads: 25,
      lastAssignedAt: null,
      tokenVersion: 0,
      createdAt,
    };
    users.push(user);
    return user;
  };

  const vp = mkUser(ORG.vp, 'VP', null, null);
  let repIdx = 0;

  for (const t of ORG.teams) {
    const teamId = newId(createdAt);
    const manager = mkUser(t.manager, 'MANAGER', vp.id, teamId);
    managerIds.push(manager.id);
    teams.push({
      id: teamId,
      name: t.name,
      region: t.region,
      countries: t.countries,
      managerId: manager.id, // users exist in the same insert pass, so the FK-free column is safe
      autoAssign: true,
      assignStrategy: t.strategy,
      rrCursor: null,
    });
    teamByRegion[t.region] = teamId;
    repsByTeam[teamId] = [];
    for (const r of t.reps) {
      const rep = mkUser(r, 'REP', manager.id, teamId);
      repsByTeam[teamId]?.push(rep.id);
      repIdByName[r.name] = rep.id;
      repFactor[rep.id] = REP_FACTORS[repIdx++] ?? 1;
    }
  }
  void rng; // org is fully deterministic from the org chart; rng is reserved for future use

  return {
    teams,
    users,
    teamByRegion,
    vpId: vp.id,
    managerIds,
    repsByTeam,
    repIdByName,
    repFactor,
  };
}
