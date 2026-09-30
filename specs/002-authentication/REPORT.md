# F02 Build Report
Status: DONE
Branch: 002-authentication · Commits: 3 (spec/plan/tasks, build, report) plus the earlier spec-report commit
## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US-1 Sign in (cookie, role home, `next`, generic 401, disabled 403, 429 limiter) | ✅ | `tests/integration/auth/login.test.ts`, `tests/unit/auth/*`, `e2e/auth.spec.ts` test 1 |
| US-2 Protected access (pages redirect, API 401, expired/tampered, BAD_ORIGIN, intake exempt) | ✅ | `tests/integration/auth/protected-routes.test.ts`, e2e test 3 |
| US-3 Sign out (cookie cleared, token revoked, idempotent) | ✅ | `session.test.ts` logout case (in-process denylist with Redis down), e2e test 2 |
| US-4 Demo "Login as" (hidden in production) | 🟡 | e2e test 2 covers the persona click. Production hiding rests on the `NODE_ENV` check in `login/page.tsx` and has no automated test |
| US-5 Revoke all sessions | ✅ | `session.test.ts` (`revokeAllSessions`, deactivated user, role read from DB) |
| Redis-backed revocation (TTL key `auth:revoked:<jti>`) | 🟡 | Written and degrades cleanly. Only the Redis-down path was exercised, since no Redis runs here |
| SC-004 login p95 < 400 ms, SC-005 no secrets in logs | 🟡 | No dedicated timing test. Tests assert no password in audit rows, and the token is never in a response body |
## Checks
typecheck: pass · lint: pass · unit+integration: 88/88 · e2e: 5/5 (PORT=3412, temp DB)
## Assumptions made (see assumptions.md)
Four self-answered clarifications. `/api/auth/logout` is on the public path list so logout still works with an expired token (idempotent 204).
## Deviations from spec
- Local `UnauthenticatedError` (code `UNAUTHENTICATED`) subclasses F01's `AppError`, so F01 is untouched.
- Limiter API is `checkLoginLimiter` / `hitLoginLimiter` (records a failure) / `resetLoginLimiter`, rather than one `hitLoginLimiter` returning `allowed`. This lets successful logins skip counting.
- T027 timing test was not written (see the SC-004 row above).
## Requires F01 / other-feature changes
- Shared-file edits: `vitest.config.ts` gained an `@` alias. `e2e/shell.spec.ts` now signs in first, because the gateway returns 401 without a session. `top-bar.tsx` and `(app)/layout.tsx` now render `UserMenu` with the team name.
- `/dashboard` (F16) does not exist yet, so the Manager/VP landing shows a 404 until then.
## Known issues / follow-ups
- Logout denylist falls back to a process-local Map when Redis is down, so it does not work across instances.
- `X-Forwarded-For` is trusted for the limiter key (demo setup).
