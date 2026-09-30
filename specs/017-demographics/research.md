# F17 Research & Decisions

| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| R1 | Suppression is a pure function `applySuppression()` run on the server before serialization | Client-side hiding; SQL `HAVING` | Keeps values from ever reaching the client (FR-006), is unit-testable at the boundaries (19/20, 29/30, 4/5), and keeps SQL simple |
| R2 | Three grouped queries, not one wide query | One query with a CASE matrix | Each chart has a different date column (`closed_at` vs `created_at`) and a different grain |
| R3 | Suppressed conversion and channel entries still expose their sample size (`closed` / `n`), but never won, shares or percent. Heatmap suppressed cells expose nothing numeric | Hide n entirely | The spec's own wording "Not enough data (n = 7, min 20)" requires n. SC-002 is about values of the metric, so n is the explained exception. Recorded so the no-leak test asserts exactly this |
| R4 | Band order and model order come from shared constants | Sort by value | Decision 4 in the F17 doc: age is ordinal |
| R5 | Insights computed on the server from non-suppressed data | Client-side | Guarantees the insight never hints at a suppressed value |
| R6 | Reuse F16 scope predicate and period resolver by import; stub locally if absent | Re-implement | FR-010 and the README rule. Stubs keep the branch buildable in a parallel wave |
| R7 | Country filter options come from countries present in scope (`SELECT DISTINCT country`), returned in the response as `availableCountries` | Hard-coded list | FR-007 "ISO codes present in scope" |
| R8 | Org average conversion includes UNKNOWN-age customers | Exclude them | It is the organization's headline conversion, so it should match the global definition |
| R9 | Palette constants in a local `palette.ts` with a unit-tested contrast check | Use an external validator | No new dependency (constitution VIII). The check is a small WCAG ratio function |
| R10 | No caching | Cache the response | F20 owns the strategy |

No open `NEEDS CLARIFICATION` items.
