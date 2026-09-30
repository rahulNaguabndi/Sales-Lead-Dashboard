# F06 Build Report
Status: PARTIAL
Branch: 006-activity-logging · Commits: see `git log` (feat(F06) implementation, docs(F06) report)

Backend (service, endpoint, shared schema), composer components and all tests are done and green. Status is PARTIAL only because the lead detail page (F05), inbox (F04) and TanStack Query are not on this branch, so the composer UI cannot be exercised end to end in a browser yet.

## Acceptance scenarios
| Scenario | Result | Evidence |
|---|---|---|
| US1.1-1.3 log a Call, persisted, survives restart | ✅ server / 🟡 UI | `activity-log.test.ts` (rows, contract, fresh DB connection), e2e API test `R3: a logged call is persisted`. Optimistic "Saving…" UI implemented in `useLogActivity`/`ActivityComposer` but not browser-verified (no detail page) |
| US1.4 inbox shows "Call · just now" | 🟡 | `last_activity_at` set and asserted; inbox is F04; UI e2e step skips until pages exist |
| US2 validation (empty, outcome rules, 2001 chars) | ✅ | `activity-schema.test.ts`, `activity-validation.test.ts`; client uses the same schema (disabled submit, red counter) |
| US3 auto bookkeeping (NEW/COLD, attempts, score, band change) | ✅ | `activity-bookkeeping.test.ts`, `auto-advance.test.ts`, `attempt-count.test.ts`, `score-totality.test.ts` |
| US4 follow-up schedule/complete, bounds, 422 | ✅ | `activity-followup.test.ts`, `quick-picks.test.ts` |
| US5 stage change, INVALID_TRANSITION, STALE_LEAD | ✅ server / 🟡 UI | `activity-stage.test.ts`; StageSelect + 409 message keep-note implemented, not browser-verified |
| US6 permissions (rep own/pool, manager, VP, 404, 401, bad Origin) | ✅ | `activity-rbac.test.ts` (10 cases); "Claim this lead to log activities" shown when `permissions.canLogActivity` is false |
| US7 idempotency, atomicity at every step, publish failure, concurrency | ✅ | `activity-atomicity.test.ts` (10 step fault injections, replay, 10-min window, publish failure) |
| US7.3 prefill API (`useComposer().prefill/focus`, aiAssisted) | ✅ | `composer-prefill.test.ts` (pure logic), hook implemented |
| SC-003/004/005 | ✅ | persistence, zero partial writes, single activity on double submit |

## Checks
typecheck: pass (shared, web, showroom) · lint: pass (0 warnings) · unit+integration: 359/359 (40 files; 105 new F06 tests) · e2e: 7 passed, 2 skipped (PORT=4506; the 2 UI tests skip because `/leads/:id` with the composer slot does not exist yet)

## Assumptions
- Used F03 action `lead:write` (with `activityType`) in place of a dedicated `activity:create`.
- Follow-up completion accepts PENDING or MISSED. Replay returns current lead state.
- Formatted follow-up timeline text uses UTC ("Follow-up scheduled for Thu 1 Oct, 10:00"); UI can reformat from `metadata.dueAt`.
- Real scoring (`loadScoreInput` + `scoreLead` from F09) is used inside the transaction; `recomputeLeadScore` is not reused because it writes its own SCORE_CHANGED shape and audit row.

## Deviations
- E2E file is `apps/web/e2e/core-loop.spec.ts` (Playwright testDir), not `tests/e2e/`.
- Contact types on WON/LOST leads return 403 (F03 rule) instead of being allowed without stage change; notes are allowed.
- A rep posting to another rep's lead gets 404 (outside F03 rep scope), not 403.
- TanStack Query is absent: the hook uses an `ActivityCache` duck-typed interface via `ActivityCacheProvider` (no new dependency).
- Amended `docs/features/F06-activity-logging.md` ("Build notes").

## Requires F01 / other-feature changes
- F05: when merging, keep the `composer` entry of `components/leads/detail/slots.tsx` (F06 created a minimal registry since it was absent), pass `{ lead, permissions.canLogActivity, currentUser }`, wrap the page in `<ActivityCacheProvider value={queryClient}>`, and optionally pass `pendingFollowUp` to the composer.
- F04/F05: timeline cache shape is handled as array, `{items}` or `{pages:[{items}]}` under `['lead', id, 'activities', ...]`.
- F07: replace the inline explicit stage change with `server/services/stage.ts#transition` when it lands.

## Known issues / follow-ups
- Composer UI has no component/browser test until F05 pages exist (UI e2e tests are written and auto-skip).
- `useComposer` focus uses `requestAnimationFrame`; not covered by automated tests.
