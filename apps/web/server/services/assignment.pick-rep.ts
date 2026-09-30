import type { AssignStrategy } from '@leaddesk/shared';
import {
  selectLanguageMatch,
  selectLoadBalanced,
  selectRoundRobin,
  type Candidate,
} from './routing';

export type PickableRep = Candidate & { maxOpenLeads: number; isActive: boolean };

export type PickResult = { candidate: Candidate; reason: string };

/**
 * Pure strategy selection (FR-008/FR-010). Inactive reps and reps at or above their open-lead limit
 * are skipped; returns null when nobody is eligible (the lead goes to the pool).
 */
export function pickRep(
  strategy: AssignStrategy,
  reps: PickableRep[],
  opts: { language: string; rrCursor: string | null },
): PickResult | null {
  const pool = reps.filter((r) => r.isActive && r.openCount < r.maxOpenLeads);
  if (pool.length === 0) return null;
  if (strategy === 'LANGUAGE_MATCH') {
    const r = selectLanguageMatch(pool, opts.language);
    return { candidate: r.candidate, reason: `${r.reason} · ${r.candidate.openCount} open leads` };
  }
  if (strategy === 'ROUND_ROBIN') {
    return { candidate: selectRoundRobin(pool, opts.rrCursor), reason: 'round robin' };
  }
  const c = selectLoadBalanced(pool);
  return { candidate: c, reason: `least loaded · ${c.openCount} open leads` };
}
