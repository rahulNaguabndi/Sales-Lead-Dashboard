# F10 Build Report
Status: DONE
Branch: 010-lead-intake-routing · Commits: 5 (spec, report, feat services/API, feat simulator/e2e, docs)

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US-1 Accept a lead (201, 401, 400 field map, 413, 415, 429 + Retry-After, honeypot 202, CORS) | ✅ | `tests/integration/intake-http.test.ts`, `e2e/intake.spec.ts` (against a real dev server) |
| US-2 Returning customers (4 phone formats, email match, phone wins, name never overwritten) | ✅ | `intake-pipeline.test.ts` "returning customers", `dedupe.test.ts` |
| US-3 Team routing (all 10 mapped countries, PL/IE/DK round-robin, sticky owner across teams) | ✅ | `intake-pipeline.test.ts` "team routing" |
| US-4 Auto-assign (load-balanced, language match + fallback, round-robin cursor, auto-assign off, capacity, no active reps, 20/50 parallel) | ✅ | `routing-select.test.ts`, `intake-pipeline.test.ts` |
| US-5 Timeline, audit, events after commit; publish failure does not fail the request | ✅ | `intake-pipeline.test.ts` "timeline, audit and events" |
| US-6 Idempotency (key replay, different payload, 10-minute implicit duplicate) | ✅ | `intake-pipeline.test.ts` "idempotency" |
| US-7 Simulator (args, seeded determinism, source mix, returning pool from seed generator, error handling, fail-fast) | ✅ | `simulate-args.test.ts`, `simulate-smoke.test.ts` |
| SC-001/002 latency | 🟡 | p95 logged in `intake-pipeline.test.ts` (asserted only < 1 s to avoid flakes); measured with Redis unreachable only |

## Checks
typecheck: pass · lint: pass · unit/integration: 278/278 (whole repo) · e2e: 2/2 (`intake.spec.ts`, PORT=3110, Redis unreachable)

## Assumptions made (see assumptions.md)
Idempotency replay with a different payload returns the original; client IP from the first `X-Forwarded-For` entry; sticky owner at capacity is skipped; dev key `showroom-dev-key` accepted only when `INTAKE_API_KEYS` is unset and NODE_ENV is not production.

## Deviations from spec
- Simulator console line shows team/score only when the response provides them (documented in the F10 doc FR-021).
- All integration tests run with Redis unreachable (degraded mode). Redis-up paths (INCR rate limit, `SET NX` lock, `rr:teams`) are implemented but not exercised against a live Redis.
- Landline warning for WhatsApp/SMS uses libphonenumber's mobile metadata: any number not typed mobile triggers `channelWarning`.
- Some tasks were merged into fewer test files (`intake-pipeline.test.ts` covers T014/T017/T022/T025/T026/T028/T038; degraded mode T034 is the default test mode).

## Requires F01 / other-feature changes
- F01 `lead.assigned` event type needs optional `strategy` and `reason` fields (F10 sends them; consumers ignore them today).
- Seeded customer phones are random digits, so ~9% are not valid E.164 numbers; the simulator filters them out for returning traffic.

## Known issues / follow-ups
- Concurrent intakes of the same brand-new customer (same phone, different requests) can create two customer rows; the implicit-duplicate window only covers already-matched customers.
- `pickAssignee` is exported for F11 but takes a transaction; F11 must call it inside its own `withTx`.
