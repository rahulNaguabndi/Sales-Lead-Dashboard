# F03 Policy API Contract (`apps/web/server/policy`)

```ts
export const ACTIONS = ['lead:read','lead:write','lead:claim','lead:assign','lead:reopen','team:read','team:settings',
  'dashboard:personal','dashboard:team','dashboard:org','demographics:read','offer:read','offer:manage','audit:read','user:list'] as const;
export type Action = (typeof ACTIONS)[number];

export type Scope = { userId: string; role: Role; userIds: Set<string>; teamIds: Set<string>; isOrgWide: boolean };

export type Resource =
  | { kind: 'lead'; lead: { id: string; ownerId: string | null; teamId: string; stage: Stage }; activityType?: string;
      targetUser?: { id: string; teamId: string | null; role: Role; isActive: boolean } | null; openLeadCount?: number }
  | { kind: 'team'; team: { id: string; managerId: string | null } }
  | { kind: 'none' };

export type AuthzResult = { allowed: true; newTeamId?: string };

export function getScope(userId: string): Promise<Scope>;          // React-cache memoized
export function resolveScope(userId: string, database?: Db): Promise<Scope>; // uncached
export function scopeCacheKey(userId: string): string;
export function leadScopeWhere(scope: Scope): SQL;                 // TRUE for org-wide
export function isLeadVisible(scope: Scope, lead: { ownerId: string | null; teamId: string }): boolean;
export function authorize(user: CurrentUser, action: Action, resource?: Resource): Promise<AuthzResult>; // throws NotFoundError | ForbiddenError
export function can(user: CurrentUser, action: Action, resource?: Resource): Promise<boolean>;
export function withAuthz<P>(handler, opts: { action: Action; loadResource?: (params: P, user: CurrentUser) => Promise<Resource | undefined>; resolveUser?: () => Promise<CurrentUser> }): RouteHandler<P>;
```

## Error mapping

| Situation | Error | HTTP | Code |
|---|---|---|---|
| Lead not visible (any lead action) | `NotFoundError` | 404 | `NOT_FOUND` |
| Visible lead, action not allowed | `ForbiddenError` | 403 | `FORBIDDEN` |
| Claim by rep at `max_open_leads` | `ForbiddenError` | 403 | `CLAIM_LIMIT_REACHED` |
| Role not permitted for non-lead action | `ForbiddenError` | 403 | `FORBIDDEN` |

## Consumer rules

- Lists/aggregates: `where(leadScopeWhere(scope))`. Single lead: load by id, then `authorize(user, 'lead:read', { kind: 'lead', lead })`.
- F11 applies `newTeamId` from the assign result; F03 never writes.
- No role comparisons outside `server/policy/**` (SC-004).
