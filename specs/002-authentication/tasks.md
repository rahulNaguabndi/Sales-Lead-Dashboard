# Tasks: F02 — Authentication & Sessions

**Input**: `specs/002-authentication/` (plan.md, spec.md, data-model.md, contracts/auth-api.md, research.md)
**Paths**: all relative to `apps/web/` unless noted. Stay inside owned paths; shared files append-only.
**Tests**: required (spec + constitution V). Pure-logic tests are written and seen failing **before** their implementation.

## Phase 1: Setup

- [x] T001 Verify F01 provides `jose`, `bcryptjs`, `ulid`, `withTx`, `writeAudit`, `getRedis`/`redisStatus`, `AppError` family and the `components/layout/user-menu.tsx` slot; if a dependency is missing, stub locally and log it under "Requires F01 change" in REPORT.md
- [x] T002 [P] Create `server/auth/constants.ts` (edge-safe): `SESSION_COOKIE='ld_session'`, `SESSION_TTL_SECONDS=28800`, `CLOCK_TOLERANCE_SECONDS=30`, `PUBLIC_PATH_PREFIXES` (`/login`, `/api/auth/login`, `/api/intake`, `/_next`, `/favicon.ico`)

## Phase 2: Foundational (blocks all stories)

- [x] T003 [P] Write failing unit tests `tests/unit/auth/next-path.test.ts`: `/leads/1` ok, `//evil.com` rejected, `https://x` rejected, `/\evil` rejected, empty → role home; `roleHome` REP→`/inbox`, MANAGER/VP→`/dashboard` (FR-010, FR-011)
- [x] T004 [P] Write failing unit tests `tests/unit/auth/jwt.test.ts`: sign→verify round-trip with claims `sub, role, teamId, name, tv, jti, iat, exp=iat+28800`; expired rejected; tampered signature rejected; wrong secret rejected; 30 s clock tolerance (FR-003)
- [x] T005 [P] Write failing unit tests `tests/unit/auth/password.test.ts` (hash ≠ plaintext, verify true/false, `DUMMY_HASH` verifies false) and `tests/unit/auth/rate-limit.test.ts` (5 failures allowed, 6th blocked with `retryAfterSeconds` > 0, separate keys per ip+email, window expiry, reset on success; Redis-degraded in-memory path) (FR-001, FR-009)
- [x] T006 [P] Implement `server/auth/next-path.ts` (`sanitizeNext`, `roleHome`) to pass T003
- [x] T007 [P] Implement `server/auth/jwt.ts` (`signSession`, `verifySession`; HS256 via `jose`, edge-safe imports only, secret from `JWT_SECRET`) to pass T004
- [x] T008 [P] Implement `server/auth/password.ts` (`hashPassword` cost 10, `verifyPassword`, `DUMMY_HASH`) to pass T005
- [x] T009 [P] Implement `server/auth/rate-limit.ts` (`hitLoginLimiter`, `resetLoginLimiter`; Redis `INCR`+`EXPIRE 900` on key `rl:login:<ip>:<emailHash>`, Map fallback) to pass T005
- [x] T010 Implement `server/auth/session.ts` (after T011 tests are written and failing; add local `UnauthenticatedError extends UnauthorizedError` with code `UNAUTHENTICATED` in `server/auth/errors.ts` so `requireUser()` matches the spec's error code without editing F01): `getCurrentUser()` (React `cache`; verify JWT → `isRevoked(jti)` skipped with warn when degraded → load user from DB → reject if missing / `is_active=0` / `tv≠token_version`), `requireUser()` (throws `UnauthenticatedError`), `setSessionCookie`/`clearSessionCookie` (`HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`, `Secure` in production), `revokeJti(jti, exp)` (`auth:revoked:<jti>`, TTL `exp−now`), `isRevoked`, `revokeAllSessions(userId)` (FR-004, FR-006, FR-007, FR-008, FR-014)
- [x] T011 Write failing unit tests (run BEFORE T010) `tests/unit/auth/session.test.ts` against a fresh seeded DB: `tv` mismatch rejected, revoked `jti` rejected, deactivated user rejected, missing user rejected, role read from DB not token, `revokeAllSessions` invalidates older token (US-5)
- [x] T012 Implement `middleware.ts`: matcher + public list from `constants.ts`; `verifySession` only (no DB/Redis); invalid/absent → pages redirect to `/login?next=<path>` (clear cookie when present but invalid, flag session-expired), `/api/*` → `401 {"error":{"code":"UNAUTHENTICATED",…}}`; Origin check on POST/PATCH/PUT/DELETE except `/api/intake/**` → `403 BAD_ORIGIN` (FR-005, FR-012)
- [x] T013 [P] Create `lib/api-client.ts` (shared fetch wrapper; on 401 → `router`/`location` replace to `/login?next=…&expired=1`; append-only for other features) (spec edge case: multiple tabs)

## Phase 3: User Story 1 — Sign in (P1) 🎯 MVP

**Independent test**: sign in as `sofia.rossi@eurodrive.test` / `demo1234` → `/inbox`.

- [x] T014 [US1] Write failing integration tests `tests/integration/auth/login.test.ts`: success sets cookie with `HttpOnly; SameSite=Lax; Path=/; Max-Age=28800` and body has no token; unknown email and wrong password give byte-identical 401 `INVALID_CREDENTIALS`; email case/whitespace normalized; disabled user 403 `ACCOUNT_DISABLED` only with correct password; non-JSON body 400 `VALIDATION_ERROR`; 6th failed attempt 429 `RATE_LIMITED` with `Retry-After`; success resets the counter; audit rows `auth.login` / `auth.login_failed` (hashed email, no plaintext) (FR-002, FR-009, FR-013)
- [x] T015 [US1] Implement `app/api/auth/login/route.ts` following plan flow (Zod `LoginSchema` password 1–200 chars → limiter → lookup → verify/dummy compare → inactive check → sign → audit in `withTx` → set cookie → `{ user: { id, name, role, teamId, home } }`)
- [x] T016 [US1] Implement `app/(auth)/login/page.tsx` (redirect to role home if already signed in) and `app/(auth)/login/login-form.tsx` (email autofocus, password show/hide toggle, loading state, `role="alert"` error text, Enter submits, honors sanitized `next`, session-expired toast "Your session expired. Please sign in again.")
- [x] T017 [P] [US1] Implement `app/api/auth/me/route.ts` (`200 { user: CurrentUser }` or `401 UNAUTHENTICATED`) with integration test `tests/integration/auth/me.test.ts`
- [x] T018 [US1] Write Playwright `tests/e2e/auth.spec.ts` scenario: visiting `/inbox` signed out redirects to `/login?next=%2Finbox` and returns to `/inbox` after credential sign-in; MANAGER lands on `/dashboard` (use `PORT`, never hardcode 3000)

## Phase 4: User Story 2 — Protected access (P1)

**Independent test**: no cookie → page redirect and API 401.

- [x] T019 [US2] Write integration test `tests/integration/auth/protected-routes.test.ts`: enumerate every `app/api/**/route.ts` (excluding `/api/auth/login`, `/api/intake/**`) and assert 401 `UNAUTHENTICATED` without a session; expired and tampered tokens treated as no cookie and the cookie cleared; public paths need no session; mutation with missing/foreign `Origin` → 403 `BAD_ORIGIN`; `/api/intake/**` exempt (SC-002, FR-005, FR-012)
- [x] T020 [US2] Fix any middleware gaps T019 reveals in `middleware.ts`

## Phase 5: User Story 3 — Sign out (P1)

**Independent test**: login → logout → replay old cookie → 401.

- [x] T021 [US3] Write failing integration test `tests/integration/auth/logout.test.ts`: logout clears cookie (`Max-Age=0`), sets `auth:revoked:<jti>` with TTL ≈ remaining life, returns 204; second logout still 204 (idempotent); replay of old token on `/api/auth/me` → 401 (Redis up); with Redis degraded logout still clears the cookie and logs a warning; `auth.logout` audit row (FR-008, FR-013, SC-003)
- [x] T022 [US3] Implement `app/api/auth/logout/route.ts`
- [x] T023 [US3] Implement `components/layout/user-menu.tsx` (fills F01 slot: name, role badge, team name, Logout action calling `/api/auth/logout` then `/login`) (FR-015)

## Phase 6: User Story 4 — Demo "Login as" (P2)

**Independent test**: persona click lands on role home; hidden in production.

- [x] T024 [US4] Implement `app/(auth)/login/demo-personas.tsx` (cards: Sofia Rossi Rep·South, Anna Weber Rep·DACH, Lukas Becker Manager·DACH, Isabelle Laurent VP; avatar initials, one-line description, per-card spinner; posts to `/api/auth/login` with `demo1234`; not rendered when `NODE_ENV=production`) and wire into `login/page.tsx`
- [x] T025 [US4] Extend `tests/e2e/auth.spec.ts`: persona click lands on role home (Rep → `/inbox`, VP → `/dashboard`) in ≤ 2 interactions (SC-001); unit/component check that personas are not rendered with `NODE_ENV=production`

## Phase 7: User Story 5 — Revoke all sessions (P2)

**Independent test**: bump `token_version`, old token → 401.

- [x] T026 [US5] Add integration case to `tests/integration/auth/me.test.ts`: login, call `revokeAllSessions(userId)`, old cookie → 401 on `/api/auth/me`; deactivate user → old cookie → 401 (FR-014)

## Phase 8: Polish & cross-cutting

- [x] T027 [P] Add a test asserting no log line or response body contains the token, password or raw email (SC-005, FR-001), and a timing sanity test that login p95 < 400 ms over 20 seeded logins (SC-004)
- [x] T028 [P] Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`; fix F02-caused failures
- [x] T029 Walk `quickstart.md` and mark acceptance scenarios in `REPORT.md`; note in REPORT.md that F02 uses a local `UnauthenticatedError` (code `UNAUTHENTICATED`) subclassing F01's `UnauthorizedError`

## Dependencies & Order

- Phase 1 → Phase 2 → stories. Within Phase 2 tests (T003–T005) precede implementations (T006–T009); T011 precedes T010; T010 needs T006–T009; T012 needs T002, T007.
- US1 needs Phase 2. US2 needs T012. US3 needs T010. US4 needs US1 (T015/T016). US5 needs T010/T017.
- Parallel: T002–T005 together; T006–T009 together; T013 and T017 alongside story work.

## Implementation Strategy

MVP = Phase 1–3 (sign in + gateway). Then US2/US3 (security-complete), then US4/US5 polish.
