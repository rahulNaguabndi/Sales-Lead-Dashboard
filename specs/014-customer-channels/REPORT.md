# F14 Build Report
Status: DONE
Branch: 014-customer-channels · Commits: 6+

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US1 channel bar / deep links | ✅ | unit tests + e2e customer-channels.spec.ts (WhatsApp, Call tel:) |
| US2 templates & language fallback | ✅ | unit tests + e2e "language switch and English fallback" |
| US3 preferences edit | ✅ | service/route tests, EditPreferencesDialog |
| US4 timezone hints / extras | ✅ | shared unit tests |
| US5 RBAC | ✅ | RBAC route tests |

## Checks
typecheck: pass · lint: pass · unit: 622/622 · e2e: 3/3 (customer-channels; run with DATABASE_URL=./data/f14.db)

## Assumptions made (see assumptions.md)
13 entries; #11 adds `leadId` to GET query / PATCH body.

## Deviations from spec
Endpoint contracts add `leadId` (contract doc amended).

## Requires F01 / other-feature changes
None.

## Known issues / follow-ups
e2e helper reads DATABASE_URL relative to apps/web; set it in worktrees with a non-default DB.
