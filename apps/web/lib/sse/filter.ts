import type { LeadDeskEvent } from '@leaddesk/shared';

/** What a stream's user is allowed to see. Built from the F03 scope. */
export type FilterScope = {
  userIds: ReadonlySet<string>;
  teamIds: ReadonlySet<string>;
  isVP: boolean;
};

/** Pure per-connection predicate (FR-006). */
export function filterFor(scope: FilterScope, userId: string): (e: LeadDeskEvent) => boolean {
  return (e) => {
    if (e.type === 'offer.changed') return true;
    if (scope.isVP) return true;
    if (e.type === 'followup.due') return e.ownerId === userId;
    if (e.ownerId !== null) {
      if (scope.userIds.has(e.ownerId)) return true;
    } else if (e.teamId !== null && scope.teamIds.has(e.teamId)) {
      return true;
    }
    return e.type === 'lead.assigned' && e.fromOwnerId !== null && scope.userIds.has(e.fromOwnerId);
  };
}
