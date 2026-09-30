# F17 Build Report
Status: DONE
Branch: 017-demographics · Commits: 4

## Acceptance scenarios
| Story/Scenario | Result | Evidence (test name or note) |
|---|---|---|
| US-1 Conversion by band (incl. suppression) | ✅ | suppression.test.ts, service.test.ts, e2e "VP sees three charts and the table view" |
| US-2 Channel mix | ✅ | service.test.ts, palette.test.ts, e2e charts visible |
| US-3 Model-interest heatmap | ✅ | service.test.ts, e2e charts visible |
| US-4 Filters and RBAC | ✅ | route-rbac.test.ts, e2e manager has no team filter, rep 403 |
| SC-003 seed story (WhatsApp vs Call) | ✅ | seed-story.test.ts |
| SC-004 timing < 800 ms, dark-mode pass | 🟡 | not formally benchmarked; dark mode covered by palette contrast tests |

## Checks
typecheck: pass · lint: pass · unit: 1097/1097 · e2e: 3/3 (demographics spec only)

## Assumptions made (see assumptions.md)
17 entries, derived from F17 doc or inferred.

## Deviations from spec
None.

## Requires F01 / other-feature changes
- F16 exports are stubbed in F17-owned paths (`_f16-stubs.ts`, `tabs.ts`); replace when F16 merges.

## Known issues / follow-ups
- Full e2e suite not run; only the demographics spec.
- Local DB needed `npm run db:reset` before e2e.
