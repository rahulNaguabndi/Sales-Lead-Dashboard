# Contract: GET /api/leads

Query params validated by `LeadListQuerySchema` (`packages/shared/src/schemas/lead-filters.ts`, F01; F04 may refine append-only).

| Param | Type | Notes |
|---|---|---|
| view | mine\|unassigned\|due_today\|going_cold\|team\|all | default: REP mine, MANAGER/VP team |
| stage, source, priority | CSV enums | |
| owner | CSV user ids or `unassigned` | MANAGER/VP; ignored for REP |
| team | CSV team ids | VP only |
| returning, overdue, closed | true\|false | |
| sla | breached | |
| sourceGroup | WEBSITE\|SOCIAL\|PAID_SEARCH\|PORTALS\|OFFLINE\|REFERRAL | expands via `SOURCE_GROUP_OF` |
| createdFrom, createdTo | ISO date | inclusive, in `tz` |
| q | string ≥ 2 | |
| sort | rank\|newest\|oldest_untouched\|next_follow_up\|score\|last_activity | default rank |
| page, pageSize | int | 1; 25 (10/25/50) |
| tz | IANA | default Europe/Berlin |

**200**: `{ items: LeadListItem[], page, pageSize, total, counts:{mine,unassigned,dueToday,overdue,newUntouched,goingCold}, view, sort }`
`LeadListItem`: id, reference, customer{id,name,city,country,isReturning,preferredChannel}, vehicleModel, source, stage, priority, score, owner{id,name,avatarColor}|null, createdAt, lastActivityAt, lastActivity{type,outcome,at}|null, nextFollowUpAt|null, flags{overdue,slaBreach,atRisk}.

**400** `{error:{code:"VALIDATION_ERROR",message,fields}}` · **401** `{error:{code:"UNAUTHENTICATED"}}`. Never 403 for out-of-scope filter values.

## Live-update contract (F12)
Query key `['leads', normalizedParams]`; F12 invalidates prefix `['leads']`. `components/leads/inbox/live-slot.ts` exports `useInboxLive(): { highlightedIds: Set<string> }`.
