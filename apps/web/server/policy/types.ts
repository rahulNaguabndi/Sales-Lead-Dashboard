import type { Role, Stage } from '@leaddesk/shared';
import type { CurrentUser as AuthUser } from '../auth/get-current-user';

/** The shared signed-in-user type (F02 owns it; the policy only reads id, role and teamId). */
export type CurrentUser = AuthUser;

export type Scope = {
  userId: string;
  role: Role;
  userIds: Set<string>;
  teamIds: Set<string>;
  isOrgWide: boolean;
};

export type LeadResource = {
  kind: 'lead';
  lead: { id: string; ownerId: string | null; teamId: string; stage: Stage };
  activityType?: string;
  /** Assign target: a user, or null to return the lead to the pool. */
  targetUser?: { id: string; teamId: string | null; role: Role; isActive: boolean } | null;
  openLeadCount?: number;
};

export type Resource =
  | LeadResource
  | { kind: 'team'; team: { id: string; managerId: string | null } }
  | { kind: 'none' };

export type AuthzResult = { allowed: true; newTeamId?: string };
