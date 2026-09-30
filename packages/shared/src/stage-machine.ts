import type { ActivityKind, ActivityType, Role, Stage } from './enums';

/** Allowed target stages per source stage (role restrictions are applied in canTransition). */
export const TRANSITIONS: Record<Stage, readonly Stage[]> = {
  NEW: ['CONTACTED', 'QUALIFIED', 'TEST_DRIVE', 'NEGOTIATION', 'LOST', 'COLD'],
  CONTACTED: ['QUALIFIED', 'TEST_DRIVE', 'NEGOTIATION', 'LOST', 'COLD'],
  QUALIFIED: ['CONTACTED', 'TEST_DRIVE', 'NEGOTIATION', 'WON', 'LOST', 'COLD'],
  TEST_DRIVE: ['CONTACTED', 'QUALIFIED', 'NEGOTIATION', 'WON', 'LOST', 'COLD'],
  NEGOTIATION: ['CONTACTED', 'QUALIFIED', 'TEST_DRIVE', 'WON', 'LOST', 'COLD'],
  WON: [],
  LOST: ['CONTACTED'],
  COLD: ['CONTACTED', 'LOST'],
};

export type StageActor = Role | 'SYSTEM';

export function canTransition(from: Stage, to: Stage, actor: StageActor): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  const privileged = actor === 'MANAGER' || actor === 'VP';
  if (to === 'COLD') return privileged || actor === 'SYSTEM';
  if (from === 'LOST') return privileged;
  return true;
}

/** A contact activity is a human touch with the customer: any USER activity except NOTE. */
export function isContactActivity(type: ActivityType, kind: ActivityKind): boolean {
  return kind === 'USER' && type !== 'NOTE';
}

/** Stage the lead moves to automatically after this activity, or null. */
export function autoAdvance(stage: Stage, type: ActivityType, kind: ActivityKind): Stage | null {
  if (!isContactActivity(type, kind)) return null;
  return stage === 'NEW' || stage === 'COLD' ? 'CONTACTED' : null;
}
