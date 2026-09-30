# Data Model: F10 (no schema changes)

F10 reads and writes existing tables (`docs/03-domain-model.md`).

| Table | Read | Write |
|---|---|---|
| `customers` | match by `phone`, `email` | insert; update preferences (preferred/secondary channel, best_time, language, age_band, city); fill missing email/phone; set `is_returning`; refresh `search_text`; never the name |
| `leads` | sticky lookup, open counts (`owner_id, stage`), idempotency and implicit duplicate, max reference | insert (reference, team_id, owner_id, assigned_at, score, priority, score_breakdown, version=1, created_at=updated_at) |
| `activities` | none | SYSTEM `LEAD_CREATED` (metadata: source, city, country, routing, idempotencyKey, dedupeConflict, unassignedReason, channelWarning); SYSTEM `ASSIGNED` (metadata: method AUTO, strategy, reason, openCount) |
| `teams` | countries, auto_assign, assign_strategy, rr_cursor | rr_cursor (ROUND_ROBIN) |
| `users` | active REPs of a team, languages, max_open_leads, last_assigned_at | last_assigned_at |
| `purchases` | existence and recency (5 years) | none |
| `audit_log` | none | `action='lead.intake'`, actor null, `after` = lead snapshot, meta `{apiKeyName, actorType:'intake'}` |

## In-memory structures

- `IntakeContext { apiKeyName, ip, idempotencyKey? }`
- `CustomerFacts { isReturning, hasRecentPurchase, stickyOwner?: { userId, teamId } }`
- `TeamResolution { teamId, routing: 'sticky' | 'country' | 'fallback_round_robin' }`
- `Assignment { ownerId | null, strategy, reason, openCount }`
- `IngestResult { kind: 'created' | 'duplicate', reference, assignedFirstName | null, expectedContact }`

## Rules

- Open stages: NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION.
- Sticky window: an open lead, or `last_activity_at` within 90 days.
- Idempotency store: LEAD_CREATED metadata (24 h); implicit window 10 min on `leads.created_at`.
- Age band from `age` when the band is UNKNOWN: 18–25, 26–35, 36–45, 46–60, 60+.
