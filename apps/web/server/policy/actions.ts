export const ACTIONS = [
  'lead:read',
  'lead:write',
  'lead:claim',
  'lead:assign',
  'lead:reopen',
  'team:read',
  'team:settings',
  'dashboard:personal',
  'dashboard:team',
  'dashboard:org',
  'demographics:read',
  'offer:read',
  'offer:manage',
  'audit:read',
  'user:list',
] as const;

export type Action = (typeof ACTIONS)[number];

/** Actions whose denial is logged at warn level (FR-013). */
export const MUTATION_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'lead:write',
  'lead:claim',
  'lead:assign',
  'lead:reopen',
  'team:settings',
  'offer:manage',
]);

export function isLeadAction(action: Action): boolean {
  return action.startsWith('lead:');
}
