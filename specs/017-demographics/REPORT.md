# F17 Build Report
Status: SPECCED
Branch: 017-demographics · Commits: 1 (spec) + 1 (report)

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US-1 … US-4 | ❌ not built yet | spec-only run. Tasks T003–T024 cover them |

## Checks
typecheck: n/a · lint: n/a · unit: n/a · e2e: n/a (spec-only)

## Assumptions made (see assumptions.md)
17 entries, all derived from docs/features/F17 or inferred (F16 stubs, tie-breaks, org average, manager `teamId`).

## Deviations from spec
None. One clarification: suppressed conversion and channel entries still expose their sample size n (required by the "n = 7, min 20" wording). See research R3.

## Requires F01 / other-feature changes
- Depends on F16 exports (period resolver, scope predicate, `ChartCard`, `FilterBar`, `useLiveRefresh`, `tabs.ts`), which are stubbed in F17-owned paths if absent.
- SC-003 relies on the seed's age/channel correlation (F01). Verified in task T024.

## Known issues / follow-ups
Differencing attack on suppression is out of scope (GDPR note). Caching is left to F20.
