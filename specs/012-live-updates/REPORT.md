# F12 Build Report
Status: DONE
Branch: 012-live-updates

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US1 new lead appears live (row, no reload) | ✅ | e2e `live-updates.spec.ts`; `toast-rules.test.ts` for toast rules |
| US1 toast (HOT 8 s, pool grouping, none for own actions) | ✅ (decision logic) / 🟡 (rendering) | `toast-rules.test.ts`; sonner rendering not asserted in a browser |
| US2 manager/VP scope | ✅ | `filter.test.ts`, `scope-leak.test.ts` |
| US2 dashboard 5 s debounce | ✅ | `invalidation.test.ts` burst test |
| US3 open lead stays current | 🟡 | Detail page is server-rendered, so `router.refresh()` runs on events for the open lead. Note logic in `updated-by.test.ts`; not covered by an e2e |
| US4 reconnect, replay, status | ✅ / 🟡 | `hub.test.ts` (replay, resync), `liveStore.test.ts` (status, offline); the dot is shown in e2e; the restart flow was not run manually |
| US5 degraded mode (memory bus) | ✅ | `hub.test.ts` memory-bus test; the e2e ran without Redis |

## Checks
typecheck: pass · lint: pass · unit: see final run (all pass) · e2e: live-updates 1/1

## Assumptions made (see assumptions.md)
Scope semantics for reps, `followup.due` assignee, toast summary fallback, logout probe.

## Deviations from spec
- Tests live next to the code (`apps/web/lib/sse/*.test.ts`) because vitest only includes `apps/web/**/*.test.ts`; tasks.md listed `tests/unit/sse/`.
- The live note is a new `liveNote` slot (not `headerActions`, which F07/F11 own). Adds one line to `DetailLayout.tsx`.
- The shared QueryClient (`lib/sse/queryClient.ts`) replaces the inbox's private client, so invalidation reaches it.
- "Updated by" falls back to "a colleague", since events carry no actor name.
- The max-3-visible toast cap relies on the app's sonner Toaster defaults (not enforced by F12 code).

## Requires F01 / other-feature changes
- F10/F11: include a lead summary in `lead.assigned` (optional; the toast falls back to generic text).

## Known issues / follow-ups
- FR-009 producers: F10 intake publishes `lead.created`/`lead.assigned` after commit; F06 activity publishes `activity.created`/`lead.updated`. F07/F08/F11/F15 have no code on this branch yet, so their publishing is unverified.
- Query keys `['lead', id]`, `['followups']`, `['dashboard']`, `['pipeline']` have no consumers yet, so invalidation is a no-op for them. The lead detail page refreshes via `router.refresh()`.
- Reassignment banner is approximated from `ownerId` and `canLogActivity` after refresh.
