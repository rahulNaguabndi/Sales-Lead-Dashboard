# F04 Build Report
Status: DONE
Branch: 004-lead-inbox · Commits: 7 on branch (spec, service, UI, e2e, report)

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US-1.1 Sofia lands on My Leads, paged 25 | ✅ | `lead-query.rbac.test` "Sofia defaults to mine…"; e2e core-loop. Seed gives Sofia 10 open leads, not 32, so the 25/page split is covered by pagination tests on the VP list instead |
| US-1.2 Overdue ranked first, "Overdue" red | ✅ | rbac "default ranking…"; `LeadRow` NextFollowUp (🟡 visual) |
| US-1.3 Score then newest tiebreak | ✅ | `lead-query.rank.test` compareRank fixture (SC-004) + SQL ranking test |
| US-1.4 NEW HOT breach shows "Respond now" and ranks up | ✅ | isSlaBreach boundaries; rbac SLA test; LeadRow badge |
| US-2.1 Row content | 🟡 | Reasoned from `LeadRow`; owner hidden on My Leads asserted in e2e |
| US-2.2 Row click / Enter opens `/leads/{id}` | ✅ | e2e core-loop + keyboard test |
| US-3.1–3.5 Tabs and views | ✅ | rbac views tests; e2e tabs (manager Team, VP All) |
| US-4.1 Filters in URL, survive reload | ✅ | e2e "filters persist" + `inbox-params.test` |
| US-4.2 Search, 250 ms debounce | ✅ | e2e search; `searchTerms` unit tests |
| US-4.3 Sort newest | ✅ | rbac newest sort |
| US-4.4 Owner filter managers only | ✅ | rank test (owners dropped for REP); e2e manager filter group |
| US-4.5 Clear filters keeps tab | ✅ | e2e + unit |
| US-5.1 Out-of-scope owner → no foreign rows | ✅ | rbac + route test + e2e API check |
| US-5.2 VP sees 3 teams | ✅ | rbac "VP sees all three teams" |
| US-6 Stat chips | 🟡 | Implemented (`StatChips`), counts covered by service tests; click behaviour not e2e-tested |
| US-7 Live-ready rows | ✅ | `live-slot.ts` stub + `data-highlight` in `LeadRow` |
| SC-001 p95 < 300 ms | ✅ | `lead-query.perf.test` (800 leads, 10 cases × 20 runs) |
| SC-003 / SC-005 | ✅ | RBAC matrix (3 users × 6 views); pagination sums |

## Checks
typecheck: pass · lint: pass · unit: 286/286 (incl. 22 rank, 36 RBAC/behaviour, 10 perf, 5 API route, 10 params) · e2e: 14/14 (9 new; run on PORT 3104)

## Assumptions made (see assumptions.md)
16 logged. Notable: going-cold uses `coalesce(last_contact_at, created_at)`; leader/org-wide derived from F03 `can()` because the SC-004 guard forbids role comparisons.

## Deviations from spec
- E2E lives in `apps/web/e2e/` (not `tests/e2e/`); F04 doc amended.
- `@tanstack/react-query` added; TanStack Table not used (plain table).
- Lead list queries use raw SQL via Drizzle `sql` in `lead-query.ts` (no separate repository file).

## Requires F01 / other-feature changes
None. `core-loop.spec.ts` is shared with F05/F06 (append steps).

## Known issues / follow-ups
- Seed gives Sofia 10 open leads vs the doc's 32; doc/seed mismatch (F01/F10), not an F04 bug.
- Playwright warns about a missing SWC lockfile patch (environmental).
- Stat-chip clicks and the mobile card layout are not covered by e2e.
